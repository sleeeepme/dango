# ダンゴムシころころ

iPhone Safariで遊べるブラウザゲームです。

## 操作
- ドラッグして移動
- 上に素早くスワイプして指を離すとジャンプ
- 左右ボタンで転がる
- エネルギー100%でぐるぐる発動

VercelのGit連携から `main` ブランチを自動デプロイします。

## 開発検証

`node --check game.js` と `node --test tests/physics-baseline.cjs` で基本動作を確認できます。
初回検証の結果と未解決問題は [docs/VERIFICATION.md](docs/VERIFICATION.md) を参照してください。
