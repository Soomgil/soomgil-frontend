/** 원본 크기를 기본으로 삼고, 최소 전시 크기와 화면 경계 안에서 비율을 유지한다. */
export function fitAwardPhoto(naturalWidth: number, naturalHeight: number, availableWidth: number, availableHeight: number) {
  if ([naturalWidth, naturalHeight, availableWidth, availableHeight].some((value) => !Number.isFinite(value) || value <= 0)) {
    return { width: 0, height: 0 }
  }
  const minimumScale = naturalWidth >= naturalHeight ? 720 / naturalWidth : 520 / naturalHeight
  const fitScale = Math.min(availableWidth / naturalWidth, availableHeight / naturalHeight)
  const scale = Math.min(Math.max(1, minimumScale), fitScale)
  return { width: naturalWidth * scale, height: naturalHeight * scale }
}
