import { describe, expect, it } from "vitest";

import { channelLabel, formatAt } from "./format";

describe("formatAt", () => {
  it("把 UTC ISO 字符串转成美西时间 sv-SE 格式", () => {
    expect(formatAt("2026-08-01T14:20:00Z")).toBe("2026-08-01 07:20");
  });

  it("解析失败时原样返回输入", () => {
    expect(formatAt("not-a-date")).toBe("not-a-date");
  });
});

describe("channelLabel", () => {
  it("wechat 转成微信", () => {
    expect(channelLabel("wechat")).toBe("微信");
  });

  it("email 或其他任意值转成邮件", () => {
    expect(channelLabel("email")).toBe("邮件");
    expect(channelLabel(null)).toBe("邮件");
  });
});
