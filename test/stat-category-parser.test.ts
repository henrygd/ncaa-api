import { describe, expect, it } from "bun:test";
import { parseHTML } from "linkedom";
import { parseStatSelect } from "../src/stats/stat-category-parser";

describe("parseStatSelect", () => {
	it("parses a standard NCAA stat dropdown", () => {
		const html = `<html><body>
			<select id="select-container-individual">
				<option value="">Select an Individual Statistic</option>
				<option value="/stats/soccer-men/d1/current/individual/5">Goals Per Game</option>
				<option value="/stats/soccer-men/d1/current/individual/6">Assists Per Game</option>
			</select>
		</body></html>`;

		const { document } = parseHTML(html);
		const result = parseStatSelect(document, "select-container-individual", "individual");

		expect(result).toEqual([
			{ id: "5", name: "Goals Per Game", path: "individual/5" },
			{ id: "6", name: "Assists Per Game", path: "individual/6" },
		]);
	});

	it("returns empty array when select element is missing", () => {
		const html = "<html><body><p>No dropdown here</p></body></html>";
		const { document } = parseHTML(html);
		const result = parseStatSelect(document, "select-container-individual", "individual");

		expect(result).toEqual([]);
	});

	it("skips placeholder options", () => {
		const html = `<html><body>
			<select id="select-container-team">
				<option value="">Select a Team Statistic</option>
				<option value="/stats/soccer-men/d1/current/team/30">Scoring Offense</option>
			</select>
		</body></html>`;

		const { document } = parseHTML(html);
		const result = parseStatSelect(document, "select-container-team", "team");

		expect(result).toEqual([
			{ id: "30", name: "Scoring Offense", path: "team/30" },
		]);
	});

	it("skips options with empty value", () => {
		const html = `<html><body>
			<select id="select-container-individual">
				<option value="">Choose</option>
				<option value="/stats/soccer-men/d1/current/individual/10">Saves Per Game</option>
			</select>
		</body></html>`;

		const { document } = parseHTML(html);
		const result = parseStatSelect(document, "select-container-individual", "individual");

		expect(result).toEqual([
			{ id: "10", name: "Saves Per Game", path: "individual/10" },
		]);
	});

	it("skips options with malformed URLs", () => {
		const html = `<html><body>
			<select id="select-container-individual">
				<option value="not-a-valid-url">Bad Option</option>
				<option value="/stats/soccer-men/d1/current/individual/5">Goals Per Game</option>
				<option value="/some/other/path">Another Bad One</option>
			</select>
		</body></html>`;

		const { document } = parseHTML(html);
		const result = parseStatSelect(document, "select-container-individual", "individual");

		expect(result).toEqual([
			{ id: "5", name: "Goals Per Game", path: "individual/5" },
		]);
	});

	it("handles empty dropdown (no options)", () => {
		const html = `<html><body>
			<select id="select-container-individual"></select>
		</body></html>`;

		const { document } = parseHTML(html);
		const result = parseStatSelect(document, "select-container-individual", "individual");

		expect(result).toEqual([]);
	});
});
