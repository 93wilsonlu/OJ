import { render, screen } from '@testing-library/react'
import VerdictBadge from '../src/components/VerdictBadge'

const CASES = [
  { verdict: 'Accepted',              label: 'AC',       cls: 'badge-accepted' },
  { verdict: 'Wrong Answer',          label: 'WA',       cls: 'badge-wrong'    },
  { verdict: 'Time Limit Exceeded',   label: 'TLE',      cls: 'badge-tle'      },
  { verdict: 'Memory Limit Exceeded', label: 'MLE',      cls: 'badge-mle'      },
  { verdict: 'Compile Error',         label: 'CE',       cls: 'badge-ce'       },
  { verdict: 'Runtime Error',         label: 'RE',       cls: 'badge-re'       },
  { verdict: 'System Error',          label: 'SE',       cls: 'badge-system'   },
  { verdict: 'pending',               label: 'Pending',  cls: 'badge-pending'  },
  { verdict: 'judging',               label: 'Judging…', cls: 'badge-pending'  },
]

describe('VerdictBadge', () => {
  test.each(CASES)('renders $label for verdict "$verdict"', ({ verdict, label, cls }) => {
    render(<VerdictBadge verdict={verdict} />)
    const el = screen.getByText(label)
    expect(el).toBeInTheDocument()
    expect(el).toHaveClass(cls)
  })

  test('shows full verdict text when showFull=true', () => {
    render(<VerdictBadge verdict="Wrong Answer" showFull />)
    expect(screen.getByText('Wrong Answer')).toBeInTheDocument()
  })

  test('falls back to badge-pending for unknown verdict', () => {
    render(<VerdictBadge verdict="Unknown" />)
    const el = screen.getByText('Unknown')
    expect(el).toHaveClass('badge-pending')
  })
})
