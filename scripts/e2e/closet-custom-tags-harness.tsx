/**
 * 自定义标签表单的浏览器测试页面（由 closet-custom-tags.e2e.mjs 打包）。
 * 挂载真实的 ClothingAnalysisEditor（单件新增表单形态）、两张批量上传卡片和编辑表单；
 * Server Action 全部替换为 mock，提交的 FormData 记录在 window.__submissions。
 */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BatchUploadItemCard } from "@/components/batch-upload-item-card";
import { ClothingAnalysisEditor } from "@/components/clothing-analysis-editor";
import { EditClothingForm } from "@/components/edit-clothing-form";
import type { BatchUploadItem } from "@/lib/batch/file-validation";
import type { ClosetItemFormValues, ClothingOptions } from "@/types/closet";

declare global {
  interface Window {
    __serverActions: Record<string, Record<string, (...args: unknown[]) => unknown>>;
    __submissions: Array<Record<string, string[]>>;
    __batchValues: Record<string, ClosetItemFormValues>;
  }
}

window.__submissions = [];
window.__batchValues = {};

function formDataToObject(formData: FormData): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  formData.forEach((value, key) => {
    (result[key] ??= []).push(String(value));
  });
  return result;
}

window.__serverActions = {
  "lib/actions/closet.ts": {
    updateClosetItem: async (...args: unknown[]) => {
      window.__submissions.push({ form: ["edit"], ...formDataToObject(args[1] as FormData) });
      return {};
    },
  },
};

const options: ClothingOptions = {
  categories: ["上衣", "裤子", "外套", "连衣裙", "鞋子", "包", "配饰"],
  styleTags: ["简约", "休闲", "通勤", "韩系", "复古", "街头", "温柔", "正式"],
  seasonTags: ["春", "夏", "秋", "冬"],
  occasionTags: ["上班", "约会", "周末", "旅行", "聚会", "日常"],
};

const empty: ClosetItemFormValues = {
  name: "白色宽松衬衫",
  category: "上衣",
  color: "白色",
  material: "棉",
  style_tags: [],
  season_tags: [],
  occasion_tags: [],
  custom_style_tags: [],
  custom_occasion_tags: [],
  notes: "",
};

function SingleAdd() {
  const [values, setValues] = useState<ClosetItemFormValues>(empty);
  return (
    <form
      id="single-form"
      onSubmit={(event) => {
        event.preventDefault();
        window.__submissions.push({ form: ["single"], ...formDataToObject(new FormData(event.currentTarget)) });
      }}
    >
      <ClothingAnalysisEditor idPrefix="single" values={values} options={options} onChange={setValues} includeHiddenInputs />
      <button type="submit" id="single-submit">保存</button>
    </form>
  );
}

function makeBatchItem(clientId: string): BatchUploadItem {
  return {
    clientId,
    file: new File([new Uint8Array(10)], `${clientId}.jpg`, { type: "image/jpeg" }),
    previewUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
    status: "needs_review",
    formValues: { ...empty, name: `批量${clientId}`, custom_style_tags: [], custom_occasion_tags: [] },
    attempts: 0,
  };
}

function Batch() {
  const [items, setItems] = useState<BatchUploadItem[]>([makeBatchItem("b1"), makeBatchItem("b2")]);
  return (
    <div id="batch">
      {items.map((entry) => (
        <div key={entry.clientId} id={`card-${entry.clientId}`}>
          <BatchUploadItemCard
            item={entry}
            options={options}
            onRemove={() => {}}
            onRetryAnalysis={() => {}}
            onRetrySave={() => {}}
            onSave={() => {}}
            onFormChange={(clientId, values) => {
              window.__batchValues[clientId] = values;
              setItems((current) => current.map((it) => (it.clientId === clientId ? { ...it, formValues: values } : it)));
            }}
          />
        </div>
      ))}
    </div>
  );
}

function App() {
  return (
    <div style={{ maxWidth: 420, padding: 12 }}>
      <section id="single"><SingleAdd /></section>
      <Batch />
      <section id="edit">
        <EditClothingForm
          itemId="11111111-1111-4111-8111-111111111111"
          options={options}
          initialValues={{ ...empty, style_tags: ["简约"], custom_style_tags: ["法式松弛感"], custom_occasion_tags: ["咖啡馆拍照"] }}
        />
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
