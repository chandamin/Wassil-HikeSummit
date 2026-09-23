import { render, screen } from '@testing-library/react';
import ThankYouStep from './ThankYouStep';

test('does not label a USD order total as GBP when the cart snapshot is missing', () => {
  render(<ThankYouStep order={{ id: 4139, default_currency_code: 'USD', total_inc_tax: '73.04' }} cart={null} />);
  expect(screen.queryByText('£73.04')).not.toBeInTheDocument();
  expect(screen.getByText(/GBP summary unavailable/i)).toBeInTheDocument();
});

test('keeps the custom confirmation in GBP when a USD order is returned', () => {
  render(<ThankYouStep
    order={{ id: 4139, default_currency_code: 'USD', total_inc_tax: '73.04' }}
    cart={{
      currency: { code: 'GBP' }, cartAmount: 54.90, baseAmount: 54.90,
      lineItems: { physicalItems: [{ id: 'item-1', product_id: 265, name: 'Hiking Set',
        quantity: 1, listPrice: 54.90 }] },
    }}
  />);
  expect(screen.getAllByText('£54.90').length).toBeGreaterThan(0);
  expect(screen.queryByText('£73.04')).not.toBeInTheDocument();
});

test('adds GBP shipping without reading USD shipping from the order', () => {
  render(<ThankYouStep
    order={{ id: 4140, default_currency_code: 'USD', total_inc_tax: '80.00', shipping_cost_inc_tax: '6.00' }}
    cart={{ currency: { code: 'GBP' }, cartAmount: 54.90, baseAmount: 54.90,
      shippingAmount: 4, lineItems: { physicalItems: [] } }}
  />);
  expect(screen.getByText('£58.90')).toBeInTheDocument();
  expect(screen.getByText('£4.00')).toBeInTheDocument();
  expect(screen.queryByText('£80.00')).not.toBeInTheDocument();
});
