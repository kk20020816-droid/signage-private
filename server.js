require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

const app = express();
const port = 3000;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.use(express.static(__dirname));

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
    const API_KEY = process.env.OPENWEATHER_API_KEY;
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
        const minutes = now.getMinutes();
        const timeOfDay = getTimeOfDay(hours);
        const isEventDayToday = isEventDay(now);
        console.log(`Server time check: Current hour is ${hours}, isEventDay: ${isEventDayToday}`);
        const { weather, temperature } = await getWeatherData();

        let basePrompt = `
あなたは東京湾クルーズ「Tokyo Bay Night Cruise」のデジタルサイネージに表示するメッセージを生成するコンテンツクリエイターです。
乗客の心に寄り添い、期待感を高めるような、魅力的で簡潔なメッセージを1つだけ生成してください。

# 現在の状況
- 現在時刻: ${hours}時${minutes}分
- 時間帯: ${timeOfDay}
- 天気: ${weather}
- 現在の気温: ${temperature}
- 本日は開催日: ${isEventDayToday ? 'はい' : 'いいえ'}
`;

        let scenarioPrompt = '';
        let constraintsPrompt = '';

        // 非開催日の場合
        if (!isEventDayToday) {
            scenarioPrompt = `
# メッセージ生成のシナリオ
- 本日は「Tokyo Bay Night Cruise」の開催日ではありません。
- 今週末の「Tokyo Bay Night Cruise」が満席盛会となっている旨を伝えてください。
- 他にも土曜日のお台場レインボー花火が見られるクルーズがあることを案内してください。
- クルーズポータル「cruisetrip.tokyo」をチェックするよう促してください。
`;

            constraintsPrompt = `
# 制約
- 2〜3行以内、最大80文字程度で生成してください。
- 親しみやすく、ポジティブなトーンでお願いします。
- 感嘆符(!)や絵文字は使わないでください。
- 必ず丁寧語を使用してください。タメ口や外国語は絶対に使わないでください。
- 必ず「cruisetrip.tokyo」という文字列を含めてください。
`;
        }
        // 開催日の場合
        else {
            // 17時30分より前（〜17:30）
            if (hours < 17 || (hours === 17 && minutes < 30)) {
                scenarioPrompt = `
# メッセージ生成のシナリオ
- 本日は「Tokyo Bay Night Cruise」の開催日です。
- しかし、今日の「Tokyo Bay Night Cruise」はすでに満席盛会となっている旨を伝えてください。
- 他にも土曜日のお台場レインボー花火が見られるクルーズがあることを案内してください。
- クルーズポータル「cruisetrip.tokyo」をチェックするよう促してください。
`;

                constraintsPrompt = `
# 制約
- 2〜3行以内、最大80文字程度で生成してください。
- 親しみやすく、ポジティブなトーンでお願いします。
- 感嘆符(!)や絵文字は使わないでください。
- 必ず丁寧語を使用してください。タメ口や外国語は絶対に使わないでください。
- 必ず「cruisetrip.tokyo」という文字列を含めてください。
`;
            }
            // 17時30分〜18時30分
            else if ((hours === 17 && minutes >= 30) || (hours === 18 && minutes < 30)) {
                // 気温から数値を取り出す（例: "15°" → 15）
                const tempValue = parseInt(temperature);
                const isCold = tempValue < 15;

                scenarioPrompt = `
# メッセージ生成のシナリオ
- 本日の「Tokyo Bay Night Cruise」は18時30分出航です。
- 桟橋には10分前（18時20分）に集合する必要があることを伝えてください。
${isCold ? `- 現在の気温は${temperature}と寒いので、その点に言及してください。` : ''}
- クルーズ後は、アトレ竹芝やポートシティ竹芝がおすすめであることを伝えてください。
`;

                constraintsPrompt = `
# 制約
- 2〜3行以内、最大80文字程度で生成してください。
- 親しみやすく、ポジティブなトーンでお願いします。
- 感嘆符(!)や絵文字は使わないでください。
- 必ず丁寧語を使用してください。タメ口や外国語は絶対に使わないでください。
- 「18時30分出航」と「10分前集合」の両方の情報を含めてください。
`;
            }
            // 18時30分以降
            else {
                // 気温から数値を取り出す（例: "15°" → 15）
                const tempValue = parseInt(temperature);
                const isCold = tempValue < 15;

                scenarioPrompt = `
# メッセージ生成のシナリオ
${isCold ? `- 現在の気温は${temperature}と寒いので、その点に言及してください。` : ''}
- 近隣のポートシティ竹芝2階「みなと横丁」であれば、席数に余裕があることを伝えてください。
- 温かいところでお食事やお飲み物を楽しんでもらえる旨を伝えてください。
`;

                constraintsPrompt = `
# 制約
- 2〜3行以内、最大80文字程度で生成してください。
- 親しみやすく、ポジティブなトーンでお願いします。
- 感嘆符(!)や絵文字は使わないでください。
- 必ず丁寧語を使用してください。タメ口や外国語は絶対に使わないでください。
- 必ず「ポートシティ竹芝2階」と「みなと横丁」の両方を含めてください。
`;
            }
        }

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

// --- 開催日判定関数 ---
// Tokyo Bay Night Cruise - 2025 Winterの開催日をチェック
function isEventDay(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // 0-indexed なので +1
    const day = date.getDate();

    // 2025年12月6日、13日、20日が開催日
    const eventDates = [
        { year: 2025, month: 12, day: 6 },
        { year: 2025, month: 12, day: 13 },
        { year: 2025, month: 12, day: 20 }
    ];

    return eventDates.some(eventDate =>
        eventDate.year === year &&
        eventDate.month === month &&
        eventDate.day === day
    );
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

// --- おすすめのレストランリスト（予備用・現在は未使用） ---
/*
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
*/