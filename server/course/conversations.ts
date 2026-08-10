import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  ConversationSummary,
  StoredConversation,
  StoredConversationsData,
  StoredTurn,
  TranscriptItem,
} from "../../shared/protocol";

const CONVERSATIONS_FILE = "conversations.json";

export async function readStoredConversations(courseDirectory: string): Promise<StoredConversationsData> {
  const filePath = join(courseDirectory, CONVERSATIONS_FILE);
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && (parsed as StoredConversationsData).version === 1 && Array.isArray((parsed as StoredConversationsData).conversations)) {
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
  const userItem = params.items.find((item) => item.kind === "user");
  const agentItem = params.items.find((item) => item.kind === "agent");

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
