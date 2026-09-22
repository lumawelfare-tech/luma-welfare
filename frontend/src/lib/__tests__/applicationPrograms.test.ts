import { describe, it, expect } from 'vitest'
import {
  applicationProgramLabel,
  formatApplicationProgramCodes,
  memberStatusLabel,
} from '../applicationPrograms'

describe('applicationPrograms', () => {
  it('labels package codes and legacy interest codes', () => {
    expect(applicationProgramLabel('hospital')).toBe('Outpatient Hospital Support')
    expect(applicationProgramLabel('OUTPATIENT')).toBe('Outpatient Hospital Support')
    expect(applicationProgramLabel('mission_of_mercy')).toBe('Mission of Mercy')
  })

  it('formats lists and pending status for members', () => {
    expect(formatApplicationProgramCodes(['welfare', 'land'])).toBe(
      'Welfare & Bereavement Support, Land Purchase Support',
    )
    expect(memberStatusLabel('pending_approval')).toBe('Pending verification')
    expect(memberStatusLabel('active')).toBe('Active')
  })
})
