import { describe, expect, it } from 'vitest'
import {
  lumaMotion,
  lumaDuration,
  lumaDistance,
  lumaScale,
  lumaStagger,
  lumaEase,
  lumaEntrance,
  lumaFade,
  lumaImage,
  lumaModal,
  lumaPage,
  lumaReveal,
  lumaStaggerDelay,
  LUMA_EASE_OUT,
} from '../lumaMotion'

describe('lumaMotion tokens', () => {
  it('exposes the documented duration scale in seconds', () => {
    expect(lumaDuration.micro).toBe(0.15)
    expect(lumaDuration.fast).toBe(0.2)
    expect(lumaDuration.normal).toBe(0.3)
    expect(lumaDuration.section).toBe(0.45)
    expect(lumaDuration.hero).toBe(0.6)
    expect(lumaDuration.data).toBe(1)
    expect(lumaMotion.duration).toBe(lumaDuration)
  })

  it('keeps movement distances subtle and professional', () => {
    expect(lumaDistance.microY).toBeLessThanOrEqual(4)
    expect(lumaDistance.enterY).toBeLessThanOrEqual(30)
    expect(lumaDistance.revealY).toBeLessThanOrEqual(30)
    expect(Math.abs(lumaDistance.hoverY)).toBeLessThanOrEqual(4)
    expect(lumaDistance.modalY).toBe(8)
    expect(lumaDistance.pageEnterY).toBeLessThanOrEqual(12)
  })

  it('uses restrained scale for hover and modal', () => {
    expect(lumaScale.hoverCta).toBeGreaterThanOrEqual(1.01)
    expect(lumaScale.hoverCta).toBeLessThanOrEqual(1.03)
    expect(lumaScale.hoverImage).toBeGreaterThanOrEqual(1.02)
    expect(lumaScale.hoverImage).toBeLessThanOrEqual(1.05)
    expect(lumaScale.modalFrom).toBe(0.97)
    expect(lumaDistance.imageScaleFrom).toBe(1.03)
  })

  it('uses entrance easing consistently', () => {
    expect(LUMA_EASE_OUT).toEqual([0.22, 1, 0.36, 1])
    expect(lumaEase.out).toEqual(LUMA_EASE_OUT)
    expect(lumaEase.cssOut).toBe('cubic-bezier(0.22, 1, 0.36, 1)')
  })

  it('limits stagger so lists never feel slow', () => {
    expect(lumaStagger.step).toBeGreaterThanOrEqual(0.04)
    expect(lumaStagger.step).toBeLessThanOrEqual(0.075)
    expect(lumaStagger.max).toBeLessThanOrEqual(0.4)
    expect(lumaStaggerDelay(100)).toBe(lumaStagger.max)
  })

  it('closes modals slightly faster than they open', () => {
    const open = lumaModal.panel.transition(false, false)
    const close = lumaModal.panel.transition(false, true)
    expect(close.duration).toBeLessThan(open.duration!)
  })

  it('exports preset variants used by motion primitives', () => {
    expect(lumaEntrance.initial.opacity).toBe(0)
    expect(lumaEntrance.animate.opacity).toBe(1)
    expect(lumaFade.initial.opacity).toBe(0)
    expect(lumaImage.initial.scale).toBe(1.03)
    expect(lumaImage.whileInView.scale).toBe(1)
    expect(lumaPage.initial.y).toBe(lumaDistance.pageEnterY)
    expect(lumaReveal.viewport.once).toBe(true)
  })
})
