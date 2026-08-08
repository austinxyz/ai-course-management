import { describe, it } from "vitest";

/**
 * The remaining unbuilt sections each own a route now.
 *
 * They used to be branches inside StudentsClient, reached by setting view
 * state. Routes keep the roster component from being the place every future
 * section has to be added, and they make "还没做" a fact about a URL rather than
 * about one component's state.
 *
 * 报课、作业、催作业、互动记录都曾经在这里，现在都有真页面了，所以从这份
 * 名单里移除——留着的话这份测试会声称一件不再为真的事。这份文件暂时空着：
 * 下一个占位路由出现时再往 it.each 里加。
 */
describe("placeholder routes", () => {
  it.skip("no placeholder routes remain", () => {});
});
