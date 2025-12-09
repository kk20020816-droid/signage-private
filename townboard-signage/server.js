require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

process.env.TZ = 'Asia/Tokyo'; // タイムゾーンを東京に設定

const app = express();
const port = 3000;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.use(express.static(__dirname));

// --- おすすめのレストランリスト（施設・ジャンル情報付き） ---
const restaurantList = [
    { name: "BANK30", facility: "アトレ竹芝", cuisine: "バー・ダイニング" },
    { name: "SHAKOBA", facility: "アトレ竹芝", cuisine: "コミュニティスペース" },
    { name: "Bluefin by UORIKI", facility: "アトレ竹芝", cuisine: "和食・寿司" },
    { name: "劇団四季SHOP&DINING 四季食堂", facility: "アトレ竹芝", cuisine: "カフェ・ダイニング" },
    { name: "PAPPAGALLO", facility: "アトレ竹芝", cuisine: "イタリアン" },
    { name: "CIELITO LINDO BAR AND GRILL", facility: "東京ポートシティ竹芝", cuisine: "メキシカン" },
    { name: "餃子酒場 龍記", facility: "東京ポートシティ竹芝", cuisine: "中華・餃子" },
    { name: "鍛冶屋文蔵", facility: "東京ポートシティ竹芝", cuisine: "居酒屋・和食" },
    { name: "沖縄酒場かふー", facility: "東京ポートシティ竹芝", cuisine: "沖縄料理" },
    { name: "串カツ田中", facility: "東京ポートシティ竹芝", cuisine: "串カツ・居酒屋" },
    { name: "ど・みそ", facility: "東京ポートシティ竹芝", cuisine: "ラーメン" },
    { name: "うみまち酒場 さかなさま", facility: "東京ポートシティ竹芝", cuisine: "海鮮居酒屋" },
    { name: "GOOD LUCK CURRY", facility: "東京ポートシティ竹芝", cuisine: "カレー" },
    { name: "イタリア酒場 HIKAGE", facility: "東京ポートシティ竹芝", cuisine: "イタリアン" },
    { name: "シュマッツ・ビア・ダイニング", facility: "東京ポートシティ竹芝", cuisine: "ドイツ料理" },
    { name: "サイアムセラドン", facility: "東京ポートシティ竹芝", cuisine: "タイ料理" },
    { name: "梅蘭", facility: "東京ポートシティ竹芝", cuisine: "中華料理" },
    { name: "博多天ぷらたかお", facility: "東京ポートシティ竹芝", cuisine: "天ぷら・和食" }
];

// --- 天気情報のキャッシュ設定 ---
let weatherCache = { data: null, lastFetched: 0 };
const CACHE_DURATION_MS = 60 * 60 * 1000; // 60分に変更

async function getWeatherData() {
    const now = Date.now();
    if (weatherCache.data && (now - weatherCache.lastFetched < CACHE_DURATION_MS)) {
        console.log('Using cached weather data.');
        return weatherCache.data;
    }
    console.log('Fetching new weather data from OpenWeatherMap (Free Plan)...');
    
    const LAT = '35.6586'; // 竹芝の緯度
    const LON = '139.7675'; // 竹芝の経度
    const API_KEY = "12674ef4e2028cf0454766b9a946e9d9";
    // 無料プランで利用可能なAPIエンドポイントに変更
    const OPENWEATHER_API_URL = `https://api.openweathermap.org/data/2.5/weather?lat=${LAT}&lon=${LON}&appid=${API_KEY}&units=metric&lang=ja`;

    if (!API_KEY) {
        console.error('OpenWeatherMap API key is not set.');
        return { weather: '晴れ', temperature: '15°' };
    }

    try {
        const response = await axios.get(OPENWEATHER_API_URL);
        const current = response.data;
        const weatherData = {
            // データ構造が少し違うため、アクセス方法を修正
            weather: current.weather[0].description, 
            temperature: `${Math.round(current.main.temp)}°`
        };
        weatherCache = { data: weatherData, lastFetched: now };
        console.log(`Successfully fetched data. Weather: "${weatherData.weather}", Temp: ${weatherData.temperature}`);
        return weatherData;
    } catch (error) {
        console.error('Failed to fetch weather data from OpenWeatherMap.', error.message);
        if (error.response && (error.response.status === 401 || error.response.status === 429)) {
            console.error(`API Error: ${error.response.data.message}`);
        }
        console.log('Using default weather data.');
        return { weather: '晴れ', temperature: '15°' };
    }
}

// OpenWeatherMapを使う場合、この関数は不要になるが、念のため残しておく
function translateWeatherCode(code) {
    // この関数はOpen-Meteo用だったので、OpenWeatherMapでは基本的に不要
    return '不明';
}

app.get('/api/generate-message', async (req, res) => {
    console.log('[/api/generate-message] Received a request.');
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const now = new Date();
        const hours = now.getHours();
        const timeOfDay = getTimeOfDay(hours);
        console.log(`Server time check: Current hour is detected as ${hours}.`);
        const { weather, temperature } = await getWeatherData();
        
        const restaurant = restaurantList[Math.floor(Math.random() * restaurantList.length)];
            
        let basePrompt = `
あなたは東京湾クルーズのデジタルサイネージに表示するコンテンツクリエイターです。
乗客のクルーズ体験をより豊かにするため、付近の魅力的な飲食店を提案するメッセージを生成してください。
`;
        
        let scenarioPrompt;
        if (hours >= 19) {
            // 19時以降のシナリオ
            scenarioPrompt = `
# メッセージ生成のシナリオと心構え
- **クルーズ後の特別な時間**を過ごせる飲食店を提案し、乗客の満足度を最大化するメッセージを生成します。
- クルーズの素晴らしい思い出を語り合いながら、美味しい食事を楽しめる場所として、以下の飲食店をおすすめしてください。
- **推薦するお店**:
  - 店名: ${restaurant.name}
  - 施設名: ${restaurant.facility}
  - ジャンル: ${restaurant.cuisine}
- **お手本**: 「クルーズの後は、${restaurant.facility}の${restaurant.cuisine}『${restaurant.name}』で、素敵な思い出を語り合ってみてはいかがでしょうか。」
- このお手本を参考に、**ジャンル情報も自然に含めつつ**、魅力的で簡潔な推薦メッセージを生成してください。
`;
        } else {
            // 19時より前のシナリオ
            scenarioPrompt = `
# メッセージ生成のシナリオと心構え
- クルーズ体験の前後に楽しめる素晴らしい食事場所として、付近の飲食店をおすすめし、乗客の満足度を高めるメッセージを生成します。
- **推薦するお店**:
  - 店名: ${restaurant.name}
  - 施設名: ${restaurant.facility}
  - ジャンル: ${restaurant.cuisine}
- **お手本**: 「クルーズの後は、${restaurant.facility}の${restaurant.cuisine}『${restaurant.name}』で、素敵な余韻に浸ってみてはいかがでしょうか。」
- このお手本を参考に、**ジャンル情報も自然に含めつつ**、魅力的で簡潔な推薦メッセージを生成してください。
`;
        }

        let constraintsPrompt = `
# 制約
- 2行以内、最大70文字程度で生成してください。
- 親しみやすく、ポジティブなトーンでお願いします。
- 感嘆符(!)や絵文字は使わないでください。
- 必ず丁寧語を使用してください。タメ口や外国語は絶対に使わないでください。
- **最重要**: 必ず「店名」(${restaurant.name})と「施設名」(${restaurant.facility})の両方を文章に含めてください。省略は許可しません。

# やってはいけないこと
- **夜景や景色、天気、時間帯についての言及は絶対にしないでください。**
`;

        const finalPrompt = basePrompt + scenarioPrompt + constraintsPrompt + "\nそれでは、上記のすべてを考慮して、最高のメッセージを生成してください:";
        
        const result = await model.generateContent(finalPrompt);
        const response = await result.response;
        const text = response.text();

        res.json({ 
            message: text.trim(),
            temperature: temperature // 気温データもレスポンスに含める
        });

    } catch (error) {
        console.error('--- DETAILED ERROR ---', error);
        res.status(500).json({ message: 'メッセージの生成に失敗しました。', error: error.message });
    }
});

function getTimeOfDay(hours) {
    if (hours >= 5 && hours < 12) return '朝';
    if (hours >= 12 && hours < 17) return '昼';
    if (hours >= 17 && hours < 21) return '夜';
    return '深夜';
}

app.get('/api/seat-status', async (req, res) => {
    console.log('[/api/seat-status] Received a request.');
    const HORAI_API_URL = 'https://api-reservation-dot-horai-scheme-verge-v2.an.r.appspot.com/reservableItems/bd74f554-b2bf-492e-bbe2-548951110778/timeSlots/timeSlotsCountWithDate?from=2025-12-05T16%3A37%3A57-09%3A00&to=2026-06-03T16%3A37%3A57-09%3A00';

    try {
        const response = await axios.get(HORAI_API_URL);
        const slots = response.data;

        const processedSlots = slots.map(slot => {
            const maxParticipants = slot.maximumTotalParticipants;
            const currentParticipants = slot.peopleCount;
            const remainingSeats = maxParticipants - currentParticipants;
            
            // 在庫が0の場合の割り算エラーを防ぐ
            const remainingPercentage = maxParticipants > 0 ? (remainingSeats / maxParticipants) * 100 : 0;

            // 日付のフォーマット (例: 12/6)
            const date = new Date(slot.startAt);
            const formattedDate = `${date.getMonth() + 1}/${date.getDate()}`;

            return {
                date: formattedDate,
                remainingPercentage: remainingPercentage
            };
        });

        res.json(processedSlots);

    } catch (error) {
        console.error('Failed to fetch seat status data.', error.message);
        res.status(500).json({ message: '空席情報の取得に失敗しました。', error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});