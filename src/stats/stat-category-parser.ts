type StatPathEntry = {
	/** Numeric ID from the NCAA.com URL (e.g., "421") */
	id: string;
	/** Human-readable stat name (e.g., "Goals") */
	name: string;
	/** Full path for use with the /stats endpoint (e.g., "individual/421") */
	path: string;
};

/**
 * Extract stat path entries from a <select> element in an NCAA.com stat page.
 *
 * NCAA stat pages have two dropdowns:
 *   #select-container-individual — individual stat categories
 *   #select-container-team       — team stat categories
 *
 * Each option's value is a relative path like /stats/soccer-men/d1/current/individual/421
 */
export function parseStatSelect(
	document: Document,
	selectId: string,
	pathType: "individual" | "team",
): StatPathEntry[] {
	const select = document.getElementById(selectId) as HTMLSelectElement | null;
	if (!select) {
		return [];
	}

	const entries: StatPathEntry[] = [];

	for (const option of select.options) {
		const value = option.value?.trim();
		const name = option.textContent?.trim();

		// Skip empty/placeholder options (e.g., "Select an Individual Statistic")
		if (!value || !name || /^select\b/i.test(name)) {
			continue;
		}

		// Extract the numeric ID from the URL
		// e.g., /stats/soccer-men/d1/current/individual/421
		const match = value.match(/\/current\/(?:individual|team)\/(\d+)/);
		if (!match || !match[1]) {
			continue;
		}

		entries.push({
			id: match[1],
			name: name,
			path: `${pathType}/${match[1]}`,
		});
	}

	return entries;
}
