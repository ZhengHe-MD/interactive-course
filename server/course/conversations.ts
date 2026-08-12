import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  Activity,
  ConversationSummary,
  StoredConversation,
  StoredConversationsData,
  StoredTurn,
  TranscriptItem,
} from "../../shared/protocol";
import type { PersistedThread, UserInput } from "../codex/types";
import { extractLearnerRequest } from "../codex/CodexClient";

const CONVERSATIONS_FILE = "conversations.json";

export async function readStoredConversations(courseDirectory: string): Promise<StoredConversationsData> {
  const filePath = join(courseDirectory, CONVERSATIONS_FILE);
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed as StoredConversationsData).version === 1 &&
      Array.isArray((parsed as StoredConversationsData).conversations)
    ) {
      return parsed as StoredConversationsData;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      // Ignore invalid or corrupt JSON and return a fresh empty container.
    }
  }
  return { version: 1, conversations: [] };
}

export async function writeStoredConversations(courseDirectory: string, data: StoredConversationsData): Promise<void> {
  const filePath = join(courseDirectory, CONVERSATIONS_FILE);
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

export async function appendStoredTurn(
  courseDirectory: string,
  params: {
    conversationId: string;
    title: string;
    turn: StoredTurn;
  },
): Promise<StoredConversationsData> {
  const data = await readStoredConversations(courseDirectory);
  const now = params.turn.createdAt || new Date().toISOString();
  let conversation = data.conversations.find((c) => c.id === params.conversationId);

  if (!conversation) {
    conversation = {
      id: params.conversationId,
      title: params.title || "New Conversation",
      createdAt: now,
      updatedAt: now,
      turns: [],
    };
    data.conversations.push(conversation);
  }

  conversation.updatedAt = now;
  if (params.title && params.title !== "New Conversation") {
    conversation.title = params.title;
  }

  const existingTurnIndex = conversation.turns.findIndex((t) => t.id === params.turn.id);
  if (existingTurnIndex >= 0) {
    conversation.turns[existingTurnIndex] = params.turn;
  } else {
    conversation.turns.push(params.turn);
  }

  await writeStoredConversations(courseDirectory, data);
  return data;
}

export function curateStoredTurn(params: {
  turnId: string;
  items: TranscriptItem[];
  createdAt?: string;
  page?: string;
}): StoredTurn {
  const userItems = params.items.filter((item) => item.kind === "user");
  const agentItems = params.items.filter((item) => item.kind === "agent");

  const userItem = userItems[userItems.length - 1];
  const agentItem = agentItems[agentItems.length - 1];

  const prompt = userItem && "text" in userItem ? userItem.text.trim() : "";
  const response = agentItem && "text" in agentItem ? agentItem.text.trim() : "";

  const reasoning: string[] = [];
  if (agentItem && "activities" in agentItem && Array.isArray(agentItem.activities)) {
    for (const activity of agentItem.activities) {
      if (activity.kind === "reasoning" && activity.detail && activity.detail.trim()) {
        reasoning.push(activity.detail.trim());
      }
    }
  }

  return {
    id: params.turnId,
    prompt,
    response,
    reasoning,
    createdAt: params.createdAt || new Date().toISOString(),
    page: params.page,
  };
}

export function storedConversationToTranscriptItems(storedConv: StoredConversation): TranscriptItem[] {
  const items: TranscriptItem[] = [];
  for (const turn of storedConv.turns) {
    if (turn.prompt) {
      items.push({ kind: "user", id: `${turn.id}-user`, text: turn.prompt, selections: [] });
    }
    if (turn.response) {
      const activities: Activity[] = turn.reasoning.map((r, i) => ({
        id: `${turn.id}-reasoning-${i}`,
        kind: "reasoning",
        label: "Thinking",
        detail: r,
        done: true,
      }));
      items.push({ kind: "agent", id: `${turn.id}-agent`, text: turn.response, activities });
    }
  }
  return items;
}

export function storedConversationFromThread(thread: PersistedThread): StoredConversation {
  const turns: StoredTurn[] = [];

  for (const turn of thread.turns) {
    let prompt = "";
    let response = "";
    const reasoning: string[] = [];

    for (const item of turn.items) {
      if (item.type === "userMessage") {
        const text = item.content?.find((input): input is Extract<UserInput, { type: "text" }> => input.type === "text")?.text
          ?? item.text;
        if (text) {
          prompt = extractLearnerRequest(text);
        }
      } else if (item.type === "agentMessage" && item.text) {
        response = item.text.trim();
      } else if (item.type === "reasoning" && item.summary?.length) {
        for (const s of item.summary) {
          if (s && s.trim()) reasoning.push(s.trim());
        }
      }
    }

    if (prompt || response) {
      turns.push({
        id: turn.id,
        prompt,
        response,
        reasoning,
        createdAt: new Date((thread.createdAt || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
      });
    }
  }

  const firstPrompt = turns[0]?.prompt;
  const title = thread.name?.trim()
    || (firstPrompt ? (firstPrompt.length > 56 ? `${firstPrompt.slice(0, 55).trimEnd()}…` : firstPrompt) : "New Conversation");

  return {
    id: thread.id,
    title,
    createdAt: new Date(thread.createdAt * 1000).toISOString(),
    updatedAt: new Date(thread.updatedAt * 1000).toISOString(),
    turns,
  };
}

export async function syncConversationsWithCodex(
  courseDirectory: string,
  codexThreads: PersistedThread[],
): Promise<StoredConversationsData> {
  const storedData = await readStoredConversations(courseDirectory);
  const codexConvs = codexThreads.map(storedConversationFromThread).filter((c) => c.turns.length > 0);

  const mergedConversations: StoredConversation[] = [];
  const codexMap = new Map(codexConvs.map((c) => [c.id, c]));

  for (const codexConv of codexConvs) {
    mergedConversations.push(codexConv);
  }

  for (const storedConv of storedData.conversations) {
    if (!codexMap.has(storedConv.id)) {
      mergedConversations.push(storedConv);
    }
  }

  const result: StoredConversationsData = {
    version: 1,
    conversations: mergedConversations,
  };

  await writeStoredConversations(courseDirectory, result);
  return result;
}

export function mergeConversationSummaries(
  codexSummaries: ConversationSummary[],
  storedData: StoredConversationsData,
): ConversationSummary[] {
  const activeIds = new Set(codexSummaries.map((s) => s.id));
  const summaries: ConversationSummary[] = [...codexSummaries];

  for (const stored of storedData.conversations) {
    if (!activeIds.has(stored.id)) {
      summaries.push({
        id: stored.id,
        title: stored.title,
        createdAt: stored.createdAt,
        updatedAt: stored.updatedAt,
        readOnly: true,
      });
    }
  }

  return summaries;
}
