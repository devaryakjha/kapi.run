import { createFileRoute } from '@tanstack/react-router'


export const Route = createFileRoute('/new')({
    component: RouteComponent,
})

function RouteComponent() {
    return <main className='flex flex-row h-svh'>
        <section className='flex flex-col flex-1/3 justify-center items-center' data-name="left-section">
            <h1 className='text-6xl'>Kapi.run</h1>
            <p className='text-gray-400 text-2xl'>Team ordering made easy</p>
            <img src='./assets/setup_cart_illustration.png' className='max-w-[80%]'/>
        </section>
        <section className='flex-2/3' data-name="right-section"></section>
    </main>
}
