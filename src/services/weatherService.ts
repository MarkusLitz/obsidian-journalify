import { requestUrl } from "obsidian";
import { GeoLocationCandidate, TemperatureUnit, UiLanguage, WeatherResult } from "../types";
import { getTodayDateKey } from "../parser/dateUtils";

interface WmoDescriptor {
	emoji: string;
	en: string;
	de: string;
}

export function describeWmoWeatherCode(code: number): WmoDescriptor {
	if (code === 0) return { emoji: "☀️", en: "Clear", de: "Sonnig" };
	if (code === 1 || code === 2) return { emoji: "⛅", en: "Partly cloudy", de: "Heiter bis wolkig" };
	if (code === 3) return { emoji: "☁️", en: "Cloudy", de: "Bewölkt" };
	if (code === 45 || code === 48) return { emoji: "🌫️", en: "Fog", de: "Nebel" };
	if (code >= 51 && code <= 57) return { emoji: "🌦️", en: "Drizzle", de: "Nieselregen" };
	if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
		return { emoji: "🌧️", en: "Rain", de: "Regen" };
	}
	if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
		return { emoji: "❄️", en: "Snow", de: "Schnee" };
	}
	if (code >= 95) return { emoji: "⛈️", en: "Thunderstorm", de: "Gewitter" };
	return { emoji: "⛅", en: "Fair", de: "Mild" };
}

export async function searchCityCoordinates(
	query: string,
	lang: UiLanguage = "en"
): Promise<GeoLocationCandidate[]> {
	const trimmed = query.trim();
	if (!trimmed) return [];

	const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
		trimmed
	)}&count=6&language=${lang}&format=json`;

	const response = await requestUrl({ url, method: "GET" });
	const data = response.json as {
		results?: Array<{
			name: string;
			admin1?: string;
			country?: string;
			latitude: number;
			longitude: number;
		}>;
	};

	if (!data?.results || !Array.isArray(data.results)) return [];
	return data.results.map((r) => ({
		name: r.name,
		admin1: r.admin1,
		country: r.country,
		latitude: r.latitude,
		longitude: r.longitude,
	}));
}

function daysBetweenDateKeys(dateKeyA: string, dateKeyB: string): number {
	const [y1, m1, d1] = dateKeyA.split("-").map(Number);
	const [y2, m2, d2] = dateKeyB.split("-").map(Number);
	const t1 = Date.UTC(y1, m1 - 1, d1);
	const t2 = Date.UTC(y2, m2 - 1, d2);
	return Math.round((t2 - t1) / 86_400_000);
}

export async function fetchWeatherForDate(
	latitude: number,
	longitude: number,
	dateKey: string,
	unit: TemperatureUnit = "celsius",
	lang: UiLanguage = "en"
): Promise<WeatherResult | null> {
	const todayKey = getTodayDateKey();
	const ageDays = daysBetweenDateKeys(dateKey, todayKey);
	const unitSymbol = unit === "fahrenheit" ? "°F" : "°C";

	if (ageDays < -7) return null;

	const useArchive = ageDays > 5;
	const baseEndpoint = useArchive
		? "https://archive-api.open-meteo.com/v1/archive"
		: "https://api.open-meteo.com/v1/forecast";

	const includeCurrent = !useArchive && dateKey === todayKey ? "&current=temperature_2m,weather_code" : "";
	const url = `${baseEndpoint}?latitude=${encodeURIComponent(
		String(latitude)
	)}&longitude=${encodeURIComponent(
		String(longitude)
	)}&start_date=${dateKey}&end_date=${dateKey}&daily=weather_code,temperature_2m_max&temperature_unit=${unit}&timezone=auto${includeCurrent}`;

	const response = await requestUrl({ url, method: "GET" });
	const json = response.json as {
		current?: { temperature_2m?: number; weather_code?: number };
		daily?: { temperature_2m_max?: Array<number | null>; weather_code?: Array<number | null> };
	};

	let temp: number | null = null;
	let code: number | null = null;

	if (json?.current && typeof json.current.temperature_2m === "number") {
		temp = json.current.temperature_2m;
		code = typeof json.current.weather_code === "number" ? json.current.weather_code : 0;
	} else if (json?.daily) {
		const dailyTemp = json.daily.temperature_2m_max?.[0];
		const dailyCode = json.daily.weather_code?.[0];
		if (typeof dailyTemp === "number") temp = dailyTemp;
		if (typeof dailyCode === "number") code = dailyCode;
	}

	if (temp === null) return null;
	const roundedTemp = Math.round(temp);
	const wmo = describeWmoWeatherCode(code ?? 0);
	const description = lang === "de" ? wmo.de : wmo.en;

	return {
		emoji: wmo.emoji,
		temperature: roundedTemp,
		unitSymbol,
		description,
		formatted: `${wmo.emoji} ${roundedTemp}${unitSymbol}`,
	};
}
