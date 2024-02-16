import { Elysia, NotFoundError } from 'elysia'
import { parseHTML } from 'linkedom'
import ExpiryMap from 'expiry-map'

const validPaths = ['stats', 'rankings', 'standings', 'history', 'scoreboard', 'schedule']

// set cache expiry to 30 min
const cache = new ExpiryMap(30 * 60 * 1000)

// set scores cache expiry to 1 min
const scoreboardCache = new ExpiryMap(1 * 60 * 1000)

//////////////////////////////////////////////////////////////////////////////
//////////////////////////////// ELYSIA //////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////

export const app = new Elysia()
	// redirect index to github page
	.get('/', ({ set }) => (set.redirect = 'https://github.com/henrygd/ncaa-api'))
	// create a store to hold cache key
	.state('cacheKey', '')
	// validate request / set cache key
	.onBeforeHandle(({ store, set, headers, path, query: { page } }) => {
		set.headers['Content-Type'] = 'application/json'

		// validate custom header value
		if (process.env.NCAA_HEADER_KEY && headers['x-ncaa-key'] !== process.env.NCAA_HEADER_KEY) {
			set.status = 401
			throw new Error('Unauthorized')
		}

		const basePath = path.split('/')[1]

		// if production, set cache control
		if (process.env.NODE_ENV === 'production') {
			set.headers['Cache-Control'] = `public, max-age=${basePath === 'scoreboard' ? '60' : '1800'}`
		}

		// check that resource is valid
		if (!validPaths.includes(basePath)) {
			set.status = 400
			throw new Error('Invalid resource')
		}

		// check that page param is an int
		if (page && !/^\d+$/.test(page)) {
			set.status = 400
			throw new Error('Page parameter must be an integer')
		}

		// set cache key
		store.cacheKey = path + (page ?? '')
	})
	// schedule route to retrieve game dates
	.get('/schedule/:sport/:division/*', async ({ store, params }) => {
		if (cache.has(store.cacheKey)) {
			return cache.get(store.cacheKey)
		}
		const { sport, division } = params

		const req = await fetch(
			`https://data.ncaa.com/casablanca/schedule/${sport}/${division}/${params['*']}/schedule-all-conf.json`
		)

		if (!req.ok) {
			throw new NotFoundError(JSON.stringify({ message: 'Resource not found' }))
		}

		const data = await req.text()
		cache.set(store.cacheKey, data)
		return data
	})
	// scoreboard route to fetch data from data.ncaa.com json endpoint
	.get('/scoreboard/:sport/*', async ({ store, params }) => {
		if (scoreboardCache.has(store.cacheKey)) {
			return scoreboardCache.get(store.cacheKey)
		}

		// get division from url
		const division = params['*'].split('/')[0]

		// find date in url
		const urlDateMatcher = /(\d{4}\/\d{2}\/\d{2})|(\d{4}\/(\d{2}|P))/
		let urlDate = params['*'].match(urlDateMatcher)?.[0]

		// if not date in passed in url, fetch date from today.json
		if (!urlDate) {
			urlDate = await getTodayUrl(params.sport, division)
		}

		const url = `https://data.ncaa.com/casablanca/scoreboard/${params.sport}/${division}/${urlDate}/scoreboard.json`

		// fetch data
		console.log(`Fetching ${url}`)
		const res = await fetch(url)
		if (!res.ok) {
			throw new NotFoundError(JSON.stringify({ message: 'Resource not found' }))
		}
		const data = await res.text()

		// cache data
		scoreboardCache.set(store.cacheKey, data)

		return data
	})
	// all other routes fetch data by scraping ncaa.com
	.get('/*', async ({ query: { page }, path, store }) => {
		if (cache.has(store.cacheKey)) {
			return cache.get(store.cacheKey)
		}
		// fetch data
		const data = JSON.stringify(await getData({ path, page }))

		// cache data
		cache.set(store.cacheKey, data)

		return data
	})
	.listen(3000)

console.log(`Server is running at ${app.server?.hostname}:${app.server?.port}`)

//////////////////////////////////////////////////////////////////////////////
/////////////////////////////// FUNCTIONS ////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////

/**
 * Fetch proper url date for today from ncaa.com
 * @param sport - sport to fetch
 * @param division - division to fetch
 */
async function getTodayUrl(sport: string, division: string): Promise<string> {
	// check cache
	const cacheKey = `today-${sport}-${division}`
	if (cache.has(cacheKey)) {
		return cache.get(cacheKey)
	}
	console.log(`Fetching today.json for ${sport} ${division}`)
	const req = await fetch(
		`https://data.ncaa.com/casablanca/schedule/${sport}/${division}/today.json`
	)
	if (!req.ok) {
		throw new NotFoundError(JSON.stringify({ message: 'Resource not found' }))
	}
	const data = await req.json()
	cache.set(cacheKey, data.today)
	return data.today as string
}

/**
 * Fetch data from ncaa.com
 * @param opts.path - path to fetch from ncaa.com
 * @param opts.page - page number to fetch
 */
async function getData(opts: { path: string; page?: string }) {
	// fetch html
	const url = `https://www.ncaa.com${opts.path}${
		opts.page && Number(opts.page) > 1 ? `/p${opts.page}` : ''
	}`
	console.log(`Fetching ${url}`)
	const res = await fetch(url)

	if (!res.ok) {
		throw new NotFoundError(JSON.stringify({ message: 'Resource not found' }))
	}

	// parse with linkedom
	const { document } = parseHTML(await res.text())

	const table = document.querySelector('main table') as HTMLTableElement

	if (!table) {
		throw new Error('Could not parse data')
	}

	const route = opts.path.split('/')[1]

	// find general info
	const sport = document.querySelector('h2.page-title')?.textContent?.trim() ?? ''

	let title = ''
	const titleEl = document.querySelectorAll(
		'.stats-header__lower__title, main option[selected], main h1.node__title'
	)?.[0]

	if (titleEl) {
		titleEl.querySelector('.hidden')?.remove()
		title = titleEl.textContent?.trim() ?? ''
	} else {
		title = route === 'standings' ? 'ALL CONFERENCES' : document.title.split(' |')[0]
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

	const data = route === 'standings' ? parseStandings(document) : parseTable(table)

	return { sport, title, updated, page, pages, data }
}

/**
 * Parse standings pages (multiple tables)
 * @param document - document to parse
 */
function parseStandings(document: Document) {
	const data = []

	const conferenceTitles = document.querySelectorAll('.standings-conference')

	for (const conf of conferenceTitles) {
		const confTable = conf.nextElementSibling as HTMLTableElement
		if (!confTable) {
			throw new Error('Could not parse data')
		}
		data.push({
			conference: conf.textContent?.trim() ?? '',
			standings: parseTable(confTable),
		})
	}

	return data
}

/**
 * Parse table elements
 * @param table - table element to parse
 */
function parseTable(table: HTMLTableElement) {
	const data = []

	let keys: (string | null)[] = []

	// standings tables have subheaders :/
	const hasSubheader = table.querySelector('.standings-table-subheader')

	if (hasSubheader) {
		keys = getStandingsHeaders(table)
	} else {
		keys = [...table.querySelectorAll('thead th')].map((th) => th.textContent)
	}

	const rows = table.querySelectorAll('tbody tr:not(.subdiv-header)')
	for (const row of rows) {
		const rowData: Record<string, string> = {}
		const cells = row.querySelectorAll('td')
		for (let i = 0; i < cells.length; i++) {
			const key = keys[i]
			if (key) {
				rowData[key] = cells[i].textContent?.trim() ?? ''
			}
		}
		data.push(rowData)
	}
	return data
}

/**
 * Merge table headers that span multiple columns.
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
		headings.push(rowOneHeadings[i] + (heading ? ` ${heading}` : ''))
	}

	return headings
}
