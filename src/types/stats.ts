export type StatPathEntry = {
	/** Numeric ID from the NCAA.com URL (e.g., "421") */
	id: string;
	/** Human-readable stat name (e.g., "Goals") */
	label: string;
	/** Full path for use with the /stats endpoint (e.g., "individual/421") */
	path: string;
};

export type StatPathsByType = {
	individual: StatPathEntry[];
	team: StatPathEntry[];
};

/** Keyed by sport (e.g., "soccer-men") → division (e.g., "d1") */
export type StatPathsData = Record<string, Record<string, StatPathsByType>>;
