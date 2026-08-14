import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Welcome } from "../src/components/Welcome";
import { Toolbar } from "../src/components/Toolbar";
import { ExportDialog } from "../src/components/ExportDialog";
import { I18nProvider } from "../src/i18n";

describe("Studio localization", () => {
  it("renders the welcome flow and language switch in Simplified Chinese", () => {
    const html = renderToStaticMarkup(
      <I18nProvider initialLanguage="zh-CN">
        <Welcome
          connected
          hasCourse={false}
          working={false}
          courseId="current"
          courses={[]}
          onBack={() => {}}
          onSwitchCourse={() => {}}
          onStart={() => {}}
        />
      </I18nProvider>,
    );

    expect(html).toContain("今天想学点儿啥？");
    expect(html).toContain("开始设计");
    expect(html).toContain('aria-label="语言"');
    expect(html).toContain('<option value="zh-CN" selected="">简体中文</option>');
    expect(html).not.toContain("What would you like to learn today?");
  });

  it("localizes the standalone export action in Simplified Chinese", () => {
    const html = renderToStaticMarkup(
      <I18nProvider initialLanguage="zh-CN">
        <Toolbar
          courseTitle="论语"
          courseId="confucious"
          courses={[]}
          inspecting={false}
          multipleSelection={false}
          canInspect
          courseChanged={false}
          checkpoints={[]}
          working={false}
          exporting={false}
          onHome={() => {}}
          onSwitchCourse={() => {}}
          onToggleInspect={() => {}}
          onToggleMultipleSelection={() => {}}
          onRevert={() => {}}
          onExport={() => {}}
        />
      </I18nProvider>,
    );

    expect(html).toContain(">导出</span>");
    expect(html).toContain('title="准备并下载独立课程文件"');
  });

  it("offers export format options and optional prompt in Simplified Chinese", () => {
    const html = renderToStaticMarkup(
      <I18nProvider initialLanguage="zh-CN">
        <ExportDialog
          open
          format="standalone"
          prompt=""
          exporting={false}
          onFormatChange={() => {}}
          onPromptChange={() => {}}
          onClose={() => {}}
          onExport={() => {}}
        />
      </I18nProvider>,
    );

    expect(html).toContain("导出课程");
    expect(html).toContain("独立 HTML 阅读器");
    expect(html).toContain("可编辑课程包");
    expect(html).toContain("导出要求（可选）");
    expect(html).toContain("留空将按原样导出");
  });
});
