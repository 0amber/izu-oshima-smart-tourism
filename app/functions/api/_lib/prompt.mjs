// prompt.mjs — /api/explain のプロンプト組立。純粋関数のみ(node --test で検証)。
export const SYSTEM_PROMPT = `あなたは伊豆大島の旅を案内する親しみやすいローカルガイドです。
ユーザーの1泊2日の旅程(JSON)を読み、日本語で解説を書いてください。

厳守するルール:
- 時刻・運賃・便名・バス停名は、旅程JSONに書かれているものだけを使うこと。新しい時刻や便を作らない。
- 旅程JSONにない施設の営業時間や料金を断定しない(「要確認」と添える)。
- 出力はMarkdown。次の4見出し(###)の構成で、全体で400〜600字:
### この旅程のポイント
### 荷物についての注意
### 雨天時の代替案
### ひとこと観光ガイド
- 雨天時の代替案では、天気予報が渡されていればそれを踏まえる。屋内・平坦な場所(椿・花ガーデン、郷土資料館、温泉など)を優先して提案し、便の時刻は旅程JSONにあるものだけを引用する。`;

export function buildExplainPrompt({ itinerary, conditions, weather }) {
  const parts = [
    "次の旅程の解説を書いてください。",
    "## 旅の条件(JSON)",
    JSON.stringify(conditions),
    "## 旅程(JSON)",
    JSON.stringify(itinerary),
  ];
  if (weather) parts.push("## 天気予報(JSON)", JSON.stringify(weather));
  return parts.join("\n");
}

// Claude API 障害時のフォールバック(pocのexplain()と同内容)
export function fallbackExplain({ hasLuggage, port }) {
  const p = port === "okada" ? "岡田港" : port === "motomachi" ? "元町港" : "港";
  if (hasLuggage) {
    return `${p}に着いたら、キャリーケースを持ったまま10分ほどでバス停へ。1本目のバスで椿・花ガーデンに向かい、平坦な園内をのんびり回ってお弁当ランチ。次のバスで大島温泉ホテルへ移動して荷物を預ければ、あとは身軽です。三原山は2日目のお楽しみ。荷物を持って山に登る必要はありません。`;
  }
  return `身軽なら1日目から三原山へ直行できます。${p}からのバスで山頂口へ上がり、火口方面を歩いたあと、バスで大島温泉ホテルへ。2日目はもう一度、朝いちばんのバスで山へ戻って裏砂漠まで足をのばすのもおすすめです。`;
}
