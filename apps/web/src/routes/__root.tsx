import { HeadContent, Outlet, createRootRoute } from '@tanstack/react-router'

import { Toaster } from '#/components/ui/sonner'

import '../styles.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [{ title: 'kapi.run' }],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <>
      <HeadContent />
      <Outlet />
      <Toaster />
    </>
  )
}
