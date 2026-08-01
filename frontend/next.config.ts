import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      /**
       * 必须**大于**后端的 2MB 上传上限（`backend/app/routers/homework.py`
       * 的 `MAX_UPLOAD_BYTES`）。
       *
       * Next.js 默认把 Server Action 的请求体卡在 1MB，且是**在 action 代码
       * 跑起来之前**就拒掉。默认值比后端那个上限小，于是 1–2MB 的文件拿到的是
       * 框架的 413，而不是我们那句"文件超过上限（2 MB）…"——`previewImport`
       * 里"预期内的失败用返回值表达"的保证，在这一整段区间里没有机会生效。
       *
       * 往上抬而不是把后端往下压：后端是唯一一条进库的路，而 MCP 那条调用
       * 完全不经过 Next。两边各留一个不同的上限，只会让"多大算大"取决于
       * 你从哪个客户端进来。
       *
       * 3mb 而不是刚好 2mb：上限管的是**原始请求体**，客户端送的是 FormData
       * （multipart），边界与字段头还要占十几 KB。卡到刚好的话，一份正好 2MB
       * 的文件会因为那点开销被挡在门外。base64 不占这笔——它是 action 在
       * 服务端才做的，不上线。
       *
       * `next.config.test.ts` 把这个关系钉成了断言。
       */
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;
