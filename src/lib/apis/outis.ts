import { WEBUI_API_BASE_URL } from '$lib/constants';

// Fork (recall mind map): one Missed / Knew it click -> Review's "My gaps" deck.
export type RecallResult = { stored: boolean; card_id: string | null; due: string | null };

export const postRecall = async (
	token: string,
	body: { root: string; path: string[]; label: string; result: 'missed' | 'knew'; siblings: string[] }
): Promise<RecallResult> => {
	const res = await fetch(`${WEBUI_API_BASE_URL}/outis/recall`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify(body)
	});
	if (!res.ok) {
		const d = (await res.json().catch(() => ({})))?.detail;
		throw new Error(typeof d === 'string' ? d : res.statusText);
	}
	return res.json();
};
