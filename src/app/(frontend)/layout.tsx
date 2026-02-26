import React from 'react'
import '@/styles/global.css'
import './styles.css'

export const metadata = {
  title: 'Maths Glitch',
  description: 'A timed maths quiz game — multiplication and division challenges.',
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <main>{children}</main>
      </body>
    </html>
  )
}
