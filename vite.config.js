// GitHub Pages デプロイ用設定
// base: './' により、ビルド出力 (dist/) 内の全アセットパスが
// /assets/xxx.js ではなく ./assets/xxx.js（相対パス）になる。
// これにより https://username.github.io/repo-name/ でも 404 が出なくなる。
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
});
