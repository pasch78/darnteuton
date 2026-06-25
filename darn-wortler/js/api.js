import { FULL_DICT_URL, EXPANDED_DICT_URL, MANIFEST_URL } from './config.js';
import { state } from './state.js';

// ==========================================================================
// API & DATA LOADING
// ==========================================================================

/**
 * Fetches dictionary assets, parses them, and populates the global state.
 * @returns {Promise<{success: boolean, error?: Error}>}
 */
export async function loadDictionaries() {
	try {
		const cacheBuster = `?t=${Date.now()}`;
		
		const fetchText = async (url) => {
			const res = await fetch(url + cacheBuster).catch(() => ({ ok: false }));
			return res.ok ? await res.text() : "";
		};
		
		const fetchJSON = async (url) => {
			const res = await fetch(url + cacheBuster).catch(() => ({ ok: false }));
			return res.ok ? await res.json() : null;
		};

		const [textFull, textExpanded, manifestJSON] = await Promise.all([
			fetchText(FULL_DICT_URL),
			fetchText(EXPANDED_DICT_URL),
			fetchJSON(MANIFEST_URL)
		]);

		if (!textExpanded || !textFull || !manifestJSON) {
			throw new Error("Missing required assets.");
		}

		const parseWords = (text) => text.split('\n').map(w => w.toUpperCase().trim()).filter(w => w.length === 5);

		state.expandedWordsList = parseWords(textExpanded);
		const fullArray = parseWords(textFull);
	
		state.validWordsSet = new Set([...state.expandedWordsList, ...fullArray]);
		state.bonusBarrierSet = new Set(state.expandedWordsList);
		state.manifest = manifestJSON;

		return { success: true };
	} catch (error) {
		console.error("Dictionary Load Failed:", error);
		return { success: false, error };
	}
}