import React from 'react'
import { createRoot } from 'react-dom/client'
import Checkout from './pages/Checkout.jsx'

const container = document.createElement('div')
container.id = 'custom-checkout-root'
document.body.appendChild(container)

createRoot(container).render(<Checkout />)
