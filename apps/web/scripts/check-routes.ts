const host = '127.0.0.1'
const port = 43991
const origin = `http://${host}:${port}`
const routes = [
  ['new', 'Start a group order · kapi.run'],
  ['join', 'Join the group order · kapi.run'],
  ['menu', 'Menu · kapi.run'],
  ['review', 'Review order · kapi.run'],
] as const

const server = Bun.spawn(
  [
    'bun',
    'run',
    'preview',
    '--',
    '--host',
    host,
    '--port',
    String(port),
    '--strictPort',
  ],
  {
    cwd: import.meta.dir.replace(/\/scripts$/, ''),
    stdout: 'ignore',
    stderr: 'pipe',
  },
)

try {
  await waitForServer()

  for (const [route, title] of routes) {
    const cleanResponse = await fetch(`${origin}/${route}`, {
      redirect: 'manual',
    })
    if (cleanResponse.status !== 308) {
      throw new Error(
        `/${route} returned ${cleanResponse.status}; expected a 308 redirect.`,
      )
    }
    if (cleanResponse.headers.get('location') !== `/${route}/`) {
      throw new Error(`/${route} did not redirect to /${route}/.`)
    }

    const pageResponse = await fetch(`${origin}/${route}/`)
    const page = await pageResponse.text()
    if (!pageResponse.ok || !page.includes(`<title>${title}</title>`)) {
      throw new Error(`/${route}/ did not return its route document.`)
    }
  }

  const inviteResponse = await fetch(`${origin}/join?i=invite1`, {
    redirect: 'manual',
  })
  if (inviteResponse.headers.get('location') !== '/join/?i=invite1') {
    throw new Error('The join redirect did not preserve its invite query.')
  }

  const missingResponse = await fetch(`${origin}/missing`, {
    redirect: 'manual',
  })
  if (missingResponse.status !== 404) {
    throw new Error('/missing fell back to the home document.')
  }

  console.log('Clean and canonical route checks passed.')
} finally {
  server.kill()
  await server.exited
}

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(origin)
      if (response.ok) return
    } catch {
      await Bun.sleep(50)
    }
  }

  const errorOutput = await new Response(server.stderr).text()
  throw new Error(`Preview server did not start.\n${errorOutput}`)
}
