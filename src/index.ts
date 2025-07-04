import { Elysia, NotFoundError } from 'elysia'
import { parseHTML } from 'linkedom'
import ExpiryMap from 'expiry-map'
import { getSemaphore } from '@henrygd/semaphore'

// set cache expiry to 30 min
const cache_30m = new ExpiryMap(30 * 60 * 1000)

// set scores cache expiry to 1 min
const cache_1m = new ExpiryMap(1 * 60 * 1000)

// valid routes for the app with their respective caches
const validRoutes = new Map([
	['stats', cache_30m],
	['rankings', cache_30m],
	['standings', cache_30m],
	['history', cache_30m],
	['schedule', cache_30m],
	['schools-index', cache_30m],
	['game', cache_1m],
	['scoreboard', cache_1m],
	['org', cache_30m]
])

/** log message to console with timestamp */
function log(str: string) {
	console.log(`[${new Date().toISOString().substring(0, 19).replace('T', ' ')}] ${str}`)
}

//////////////////////////////////////////////////////////////////////////////
//////////////////////////////// ELYSIA //////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////

export const app = new Elysia()
	// redirect index to github page
	.get('/', ({ redirect }) => redirect('https://github.com/henrygd/ncaa-api'))
	// validate request / set cache key
	.resolve(({ request, path, error, query: { page } }) => {
		// validate custom header value
		if (
			process.env.NCAA_HEADER_KEY &&
			request.headers.get('x-ncaa-key') !== process.env.NCAA_HEADER_KEY
		) {
			return error(401)
		}
		// check that page param is an int
		if (page && !/^\d+$/.test(page)) {
			return error(400, 'Page parameter must be an integer')
		}
		// check that resource is valid
		const basePath = path.split('/')[1]

		if (!validRoutes.has(basePath)) {
			return error(400, 'Invalid resource')
		}
		return {
			basePath,
			cache: validRoutes.get(basePath) ?? cache_1m,
			cacheKey: path + (page ?? ''),
		}
	})
	.onBeforeHandle(({ set, cache, cacheKey }) => {
		set.headers['Content-Type'] = 'application/json'
		set.headers['Cache-Control'] = `public, max-age=${cache === cache_1m ? 60 : 1800}`
		if (cache.has(cacheKey)) {
			return cache.get(cacheKey)
		}
	})
	// schools-index route to return list of all schools
	.get('/schools-index', async ({ cache, cacheKey, error }) => {
		const req = await fetch('https://www.ncaa.com/json/schools')
		try {
			const json = (await req.json()).map((school: Record<string, string>) => ({
				slug: school.slug,
				name: school.name?.trim(),
				long: school.long_name?.trim(),
			}))
			const data = JSON.stringify(json)
			cache.set(cacheKey, data)
			return data
		} catch (err) {
			return error(500, 'Error fetching data')
		}
	})
	.get('/org/playbyplay/:game_id', async ({ cache, cacheKey, error, params: { game_id } }) => {
		if (!game_id) return error(400, 'Game ID is required')
	  
		const url = `https://stats.ncaa.org/contests/${game_id}/play_by_play`
	  
		const res = await fetch(url)
		if (!res.ok) return error(404, 'Game page not found')
	  
		const html = await res.text()
		const { document } = parseHTML(html)
	  
		const quarterHeaders = Array.from(document.querySelectorAll('.card-header'))
		const allTables = Array.from(document.querySelectorAll('table.table'))
	  
		const stats = []
		const periodNumbers = []
	  
		for (let i = 0; i < quarterHeaders.length; i++) {
		  const header = quarterHeaders[i]
		  const table = allTables[i]
	  
		  if (!header || !table) continue
	  
		  // extract "1st Quarter", "2nd Quarter", etc.
		  const periodLabel = header.textContent?.trim()
		  const match = periodLabel?.match(/(\d+)/)
		  const period = match ? parseInt(match[1]) : i + 1
	  
		  periodNumbers.push(period)
	  
		  const rows = Array.from(table.querySelectorAll('tbody tr'))
	  
		  for (const row of rows) {
			const cells = Array.from(row.querySelectorAll('td')).map((td) =>
			  td.textContent?.trim()
			)
	  
			if (cells.length === 4) {
			  stats.push({
				period,
				time: cells[0],
				team1: cells[1],
				score: cells[2],
				team2: cells[3]
			  })
			}
		  }
		}
	  
		const data = 
		{
			game: game_id,
			stats
		}

  		cache.set(cacheKey, data)

		return data
	  })
	// team's schedule
	.get('org/teams/:id', async ({ cache, cacheKey, error, params: { id } }) => {
		if (!id) return error(400, 'Team id is required')
	
		const url = `https://stats.ncaa.org/teams/${id}` // gets team page
		const req = await fetch(url)
		if (!req.ok) return error(404, 'Team page not found')
	
		const html = await req.text()
		const { document } = parseHTML(html)
	
		const table = document.querySelector('table')
		if (!table) return error(500, 'Could not find schedule table')

		const rows = table.querySelectorAll('tbody tr.underline_rows')

		const schedule = Array.from(rows).map(row => {
			const cells = row.querySelectorAll('td')		// gets all rows 

			const date = cells[0]?.textContent?.trim() ?? ''
			const opponent = cells[1]?.querySelector('a')?.textContent?.trim() ?? ''
			const result = cells[2]?.querySelector('a')?.textContent?.trim() ?? ''
			const boxScoreHref = cells[2]?.querySelector('a')?.getAttribute('href') ?? ''
			const box_score_url = boxScoreHref ? `https://stats.ncaa.org${boxScoreHref}` : ''
			const attendance = cells[3]?.textContent?.trim() ?? ''
			return { date, opponent, result, box_score_url, attendance }
		})
		
		const result = JSON.stringify(schedule)
		cache.set(cacheKey, result)
		return result
	})
	// PARARMS:
	// home = home team name
	// away = away team name 
	// date = date game takes place MM-DD-YYY format
	// sport = wlax or mlax 
	// divsion = 1, 2, or 3 
	.get('/org/gameid/:home/:away/:date/:sport?/:division?', async ({ cache, cacheKey, params, error }) => {
		const { home, away, date } = params
		const sport = params.sport || 'mlax'
		const division = params.division || '1'
	  
		if (!away) return error(400, 'Away team name is required')
		if (!home) return error(400, 'Home team name is required')
		if (!date) return error(400, 'Date is required')
	
		// parse date in MM-DD-YYYY format
		const [monthStr, dayStr, yearStr] = date.split('-')
		if (!monthStr || !dayStr || !yearStr) return error(400, 'Invalid date format')
	
		const inputDate = new Date(`${yearStr}-${monthStr}-${dayStr}`)
		const now = new Date()
	
		if (isNaN(inputDate.getTime())) return error(400, 'Invalid date')
		if (parseInt(yearStr) < 2024) return error(402, 'Date is too early')
		if (inputDate > now) return error(403, "Date hasn't happened yet")
	
		// determine season label
		let yearLabel: string
		if (yearStr === '2025') {
			yearLabel = '24-25'
		} else if (yearStr === '2024') {
			yearLabel = '23-24'
		} else {
			return error(400, 'Unsupported season year')
		}
	
		// determine gender
		let gender: string
		if (sport === 'mlax') gender = 'M'
		else if (sport === 'wlax') gender = 'F'
		else return error(400, 'Sport must be mlax or wlax')
	
		// parse division
		const div = parseInt(division)
		if (![1, 2, 3].includes(div)) return error(400, 'Division must be 1, 2, or 3')
	
		// manually assign season_division_id
		let seasonId: number | null = null
	
		if (yearLabel === '24-25') {
			if (div === 1 && gender === 'M') seasonId = 18484
			else if (div === 2 && gender === 'M') seasonId = 18485
			else if (div === 3 && gender === 'M') seasonId = 18487
			else if (div === 1 && gender === 'F') seasonId = 18483
			else if (div === 2 && gender === 'F') seasonId = 18486
			else if (div === 3 && gender === 'F') seasonId = 18488
		}
	
		if (yearLabel === '23-24') {
			if (div === 1 && gender === 'M') seasonId = 18240
			else if (div === 2 && gender === 'M') seasonId = 18241
			else if (div === 3 && gender === 'M') seasonId = 18242
			else if (div === 1 && gender === 'F') seasonId = 18260
			else if (div === 2 && gender === 'F') seasonId = 18262
			else if (div === 3 && gender === 'F') seasonId = 18263
		}
	
		if (!seasonId) return error(400, 'Could not find season division ID')
	
	
		const url = `https://stats.ncaa.org/contests/livestream_scoreboards?utf8=✓&season_division_id=${seasonId}&game_date=${monthStr}%2F${dayStr}%2F${yearStr}conference_id=0&tournament_id=&commit=Submit`
			
		const res = await fetch(url)
		if (!res.ok) return error(404, 'Could not fetch scoreboard page')

		const html = await res.text()
		const { document } = parseHTML(html)

		// Find all tables
		const tables = document.querySelectorAll('table')

		let foundHref: string | null = null

		for (const table of tables) {
			const cells = Array.from(table.querySelectorAll('td')).map((td) =>
			td.textContent?.trim()
			)

			const team1Match = cells.some((text) =>
			text?.toLowerCase().includes(home.toLowerCase())
			)
			const team2Match = cells.some((text) =>
			text?.toLowerCase().includes(away.toLowerCase())
			)

			if (team1Match && team2Match) {
			const boxLink = Array.from(table.querySelectorAll('a')).find(
				(a) => a.textContent?.trim() === 'Box Score'
			)

			if (boxLink) {
				foundHref = boxLink.getAttribute('href')
				break
			}
			}
		}

		if (!foundHref) {
			return error(404, `No game found between "${home}" and "${away}" on ${date}`)
		}

		// Extract numeric game ID from URL
		const idMatch = foundHref.match(/\/(\d+)\//)
		const gameId = idMatch ? idMatch[1] : null

		if (!gameId) {
			return error(500, 'Box score found but could not extract game ID')
		}

		const data = {
			game_id: gameId
		}

		cache.set(cacheKey, data)
		return data
		})
	// game route to retrieve game details
	.get('/game/:id?/:page?', async ({ cache, cacheKey, error, params: { id, page } }) => {
		if (!id) {
			return error(400, 'Game id is required')
		}
		// handle base game route
		if (!page) {
			const req = await fetch(
				`https://sdataprod.ncaa.com/?meta=GetGamecenterGameById_web&extensions={%22persistedQuery%22:{%22version%22:1,%22sha256Hash%22:%2293a02c7193c89d85bcdda8c1784925d9b64657f73ef584382e2297af555acd4b%22}}&variables={%22id%22:%22${id}%22,%22week%22:null,%22staticTestEnv%22:null}`
			)
			if (!req.ok) {
				return error(404, 'Resource not found')
			}
			const data = JSON.stringify((await req.json())?.data)
			cache.set(cacheKey, data)
			return data
		}
		// handle other game routes
		if (page === 'play-by-play') {
			page = 'pbp'
		} else if (page === 'scoring-summary') {
			page = 'scoringSummary'
		} else if (page === 'team-stats') {
			page = 'teamStats'
		}
		const req = await fetch(`https://data.ncaa.com/casablanca/game/${id}/${page}.json`)
		if (!req.ok) {
			return error(404, 'Resource not found')
		}
		const data = JSON.stringify(await req.json())
		cache.set(cacheKey, data)
		return data
	})
	// schedule route to retrieve game dates
	.get('/schedule/:sport/:division/*', async ({ cache, cacheKey, params, error }) => {
		const { sport, division } = params

		const req = await fetch(
			`https://data.ncaa.com/casablanca/schedule/${sport}/${division}/${params['*']}/schedule-all-conf.json`
		)

		if (!req.ok) {
			return error(404, 'Resource not found')
		}

		const data = JSON.stringify(await req.json())
		cache.set(cacheKey, data)
		return data
	})
	// scoreboard route to fetch data from data.ncaa.com json endpoint
	.get('/scoreboard/:sport/*', async ({ cache, cacheKey, params, set, error }) => {
		const semCacheKey = getSemaphore(cacheKey)
		await semCacheKey.acquire()
		try {
			if (cache.has(cacheKey)) {
				set.headers['x-score-cache'] = 'hit'
				return cache.get(cacheKey)
			}

			// get division from url
			const division = params['*'].split('/')[0]

			// find date in url
			const urlDateMatcher = /(\d{4}\/\d{2}\/\d{2})|(\d{4}\/(\d{2}|P))/
			let urlDate = params['*'].match(urlDateMatcher)?.[0]

			if (urlDate) {
				// return 400 if date is more than a year in the future
				// (had runaway bot requesting every day until I noticed it in 2195)
				if (new Date(urlDate).getFullYear() > new Date().getFullYear() + 1) {
					return error(400, 'Invalid date')
				}
			} else {
				// if date not in passed in url, fetch date from today.json
				urlDate = await getTodayUrl(params.sport, division)
			}

			const url = `https://data.ncaa.com/casablanca/scoreboard/${params.sport}/${division}/${urlDate}/scoreboard.json`

			const semUrl = getSemaphore(url)
			await semUrl.acquire()
			try {
				// check cache
				if (cache.has(url)) {
					set.headers['x-score-cache'] = 'hit'
					return cache.get(url)
				}
				// fetch data
				log(`Fetching ${url}`)
				const res = await fetch(url)
				if (!res.ok) {
					return error(404, 'Resource not found')
				}
				const data = JSON.stringify(await res.json())
				cache.set(cacheKey, data)
				cache.set(url, data)
				return data
			} finally {
				semUrl.release()
			}
		} finally {
			semCacheKey.release()
		}
	})
	// all other routes fetch data by scraping ncaa.com
	.get('/*', async ({ query: { page }, path, cache, cacheKey }) => {
		if (cache.has(cacheKey)) {
			return cache.get(cacheKey)
		}
		// fetch data
		const data = await getData({ path, page })
		cache.set(cacheKey, data)
		return data
	})
	.listen(3000)

log(`Server is running at ${app.server?.url}`)

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
	if (cache_30m.has(cacheKey)) {
		return cache_30m.get(cacheKey)
	}
	log(`Fetching today.json for ${sport} ${division}`)
	const req = await fetch(
		`https://data.ncaa.com/casablanca/schedule/${sport}/${division}/today.json`
	)
	if (!req.ok) {
		throw new NotFoundError(JSON.stringify({ message: 'Resource not found' }))
	}
	const data = await req.json()
	cache_30m.set(cacheKey, data.today)
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
	log(`Fetching ${url}`)
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

process.on('SIGINT', async () => {
	console.log('\nShutting down...')
	await app.stop()
	process.exit(0)
})
