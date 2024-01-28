import { Elysia, NotFoundError } from 'elysia'
import { parseHTML } from 'linkedom'

const validPaths = ['stats', 'rankings', 'standings', 'history']

//////////////////////////////////////////////////////////////////////////////
//////////////////////////////// ELYSIA //////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////

const app = new Elysia()
	.get('/', ({ set }) => {
		// redirect to github page
		set.redirect = 'https://github.com/henrygd/ncaa-api'
	})
	.get('/*', async ({ query: { page }, path, set }) => {
		set.headers['Content-Type'] = 'application/json'
		// if production, cache for 30 min
		if (process.env.NODE_ENV === 'production') {
			set.headers['Cache-Control'] = 'public, max-age=1800'
		}

		// check that resource is valid
		if (!validPaths.includes(path.split('/')[1])) {
			set.status = 400
			throw new Error('Invalid resource')
		}

		// check that page param is an int
		if (page && !/^\d+$/.test(page)) {
			set.status = 400
			throw new Error('Page parameter must be an integer')
		}

		const data = await getData({ path, page })
		return JSON.stringify(data)
	})
	.listen(3000)

console.log(`Server is running at ${app.server?.hostname}:${app.server?.port}`)

//////////////////////////////////////////////////////////////////////////////
/////////////////////////////// FUNCTIONS ////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////

/**
 * Fetch data from ncaa.com
 * @param opts.path - path to fetch from ncaa.com
 * @param opts.page - page number to fetch
 */
async function getData(opts: { path: string; page?: string }) {
	// fetch html
	const res = await fetch(
		`https://www.ncaa.com/${opts.path}${opts.page && Number(opts.page) > 1 ? `/p${opts.page}` : ''}`
	)

	if (!res.ok) {
		throw new NotFoundError(JSON.stringify({ message: 'Resource not found' }))
	}

	// parse with linkedom
	const { document } = parseHTML(await res.text())

	const table = document.querySelector('main table') as HTMLTableElement

	if (!table) {
		throw new Error('Could not parse data')
	}

	// find general info
	const sport = document.querySelector('h2.page-title')?.textContent?.trim() ?? ''

	let title = ''
	const titleEl = document.querySelectorAll(
		'.stats-header__lower__title, main option[selected], main h1.node__title'
	)?.[0]

	if (titleEl) {
		titleEl.querySelector('.hidden')?.remove()
		title = titleEl.textContent?.trim() ?? ''
	}

	let updated =
		document
			.querySelectorAll(
				'.stats-header__lower__desc, .rankings-last-updated, .standings-last-updated'
			)?.[0]
			?.textContent?.replace(/Last updated /i, '')
			.trim() ?? ''

	// figure out pages
	let page = 1
	let pages = 1
	const tablePageLinks = document.querySelectorAll(
		'ul.stats-pager li:not(.stats-pager__li--prev):not(.stats-pager__li--next)'
	)
	if (tablePageLinks.length > 0) {
		page = [...tablePageLinks].findIndex((li) => li.classList.contains('active')) + 1
		pages = tablePageLinks.length
	}

	const data = []

	let headings: (string | null)[] = []

	if (opts.path.includes('standings')) {
		headings = getStandingsHeaders(table)
	} else {
		headings = [...table.querySelectorAll('thead th')].map((th) => th.textContent)
	}

	const rows = table.querySelectorAll('tbody tr:not(.subdiv-header)')
	for (const row of rows) {
		const rowData: Record<string, string> = {}
		const cells = row.querySelectorAll('td')
		for (let i = 0; i < cells.length; i++) {
			const heading = headings[i]
			if (heading) {
				rowData[heading] = cells[i].textContent?.trim() ?? ''
			}
		}
		data.push(rowData)
	}

	return { sport, title, updated, page, pages, data }
}

/**
 * Merge table headers that span multiple column.
 * Use the first row of headers as the base according to colspan and
 * concat the second row th textContent to the first row th textContent
 * @param table - table element to parse
 */
function getStandingsHeaders(table: HTMLTableElement) {
	const tableRowOne = table.querySelector('.standings-table-header')
	const tableRowTwo = table.querySelector('.standings-table-subheader')

	if (!tableRowOne || !tableRowTwo) {
		throw new Error('Could not parse data')
	}

	const headings: (string | null)[] = []
	const rowOneHeadings: string[] = []

	const rowOneThs = tableRowOne.querySelectorAll('th')
	for (const th of rowOneThs) {
		const colspan = Number(th.getAttribute('colspan')) || 1
		const heading = th.textContent?.trim() ?? ''
		for (let i = 0; i < colspan; i++) {
			rowOneHeadings.push(heading)
		}
	}

	const rowTwoThs = tableRowTwo.querySelectorAll('th')
	for (let i = 0; i < rowTwoThs.length; i++) {
		const th = rowTwoThs[i]
		const heading = th.textContent?.trim() ?? ''
		headings.push(rowOneHeadings[i] + ' ' + heading)
	}

	return headings
}
