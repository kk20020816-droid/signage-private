
require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = 3000;

// APIキーを環境変数から取得
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// フロントエンドのファイル（index.htmlやassetsフォルダ）を配信するための設定
app.use(express.static(__dirname));

// メッセージ生成APIのエンドポイント
app.get('/api/generate-message', async (req, res) => {
    console.log('[/api/generate-message] Received a request.'); // この行を追加
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        // --- AIへの指示に必要な情報を収集 ---
        const now = new Date();
        const hours = now.getHours();
        const timeOfDay = getTimeOfDay(hours); // 朝、昼、夜などを取得

        // 仮の天気情報（将来的には天気APIから取得）
        const weather = "晴れ";
        const temperature = "15℃";

        // --- プロンプトの作成 ---
        const prompt = `
あなたはデジタルサイネージのコンテンツクリエーターです。
以下の状況に合わせた、船のクルーズ客に向けた魅力的で簡潔なメッセージを1つだけ生成してください。

制約:
- 2行以内で、最大50文字程度に収めてください。
- 1行の場合は中央揃えで表示されるデザインです。
- 親しみやすく、ポジティブなトーンでお願いします。
- 事実に基づいた情報（天気、気温、時間帯）を自然に文章に含めてください。
- 感嘆符(!)や絵文字は使わないでください。

現在の状況:
- 時間帯: ${timeOfDay} (${hours}時)
- 天気: ${weather}
- 気温: ${temperature}

メッセージ生成例:
- 穏やかな風が心地よい昼下がりです。デッキで東京の景色を楽しみませんか。
- 空気が澄んだ夜です。暖かい服装で美しい夜景をお楽しみください。

それでは、メッセージを生成してください:
`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        res.json({ message: text.trim() });

    } catch (error) {
        console.error('--- DETAILED ERROR ---');
        console.error('Error generating message:', error);
        console.error('--- END OF ERROR ---');
        res.status(500).json({ 
            message: 'メッセージの生成に失敗しました。サーバーのログを確認してください。',
            error: error.message 
        });
    }
});

// 時間帯を返すヘルパー関数
function getTimeOfDay(hours) {
    if (hours >= 5 && hours < 12) return '朝';
    if (hours >= 12 && hours < 17) return '昼';
    if (hours >= 17 && hours < 21) return '夜';
    return '深夜';
}

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
