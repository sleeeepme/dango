# ダンゴムシころころ

広い地下を横に探検し、光るキノコをたよりに次の降り口を見つける、iPhone Safari向けのブラウザゲームです。ゲームオーバーはありません。

公開: https://dangomushi-korokoro-game.vercel.app/

## 操作

- 左右へドラッグし、そのまま保持すると転がり続けます。
- 素早く上へスワイプして指を離すとジャンプします。
- 左右ボタンでも移動できます。
- エネルギー100%で「ぐるぐる！」を発動できます。
- PCでは左右矢印キーで移動、上矢印キーまたはSpaceでジャンプできます。

2240px幅のワールドをカメラが左右・上下に追いかけます。階ごとに降り口が移動し、地形を探しながら奥へ進みます。深さに応じて地下の色と収集物が変わります。

## 開発・検証

ビルドと依存パッケージは不要です。

```sh
python3 -m http.server 8768 --bind 127.0.0.1
node --check game.js
node --test tests/physics-baseline.cjs
```

検証結果は [docs/VERIFICATION.md](docs/VERIFICATION.md) を参照してください。
GitHubの `main` へのpushをVercelのGit連携が自動公開します。公開URLは変わりません。
