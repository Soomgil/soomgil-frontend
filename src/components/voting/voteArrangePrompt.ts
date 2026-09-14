/**
 * 투표로 선정된 장소를 AI 가이드에게 배치 요청하는 프롬프트.
 * 결과 화면(페이지·모달) 양쪽에서 같은 문장을 쓰기 위해 분리했다.
 */
export function buildVoteArrangePrompt(names: string[]) {
  const list = names.filter(Boolean)
  const head = list.length > 0 ? `투표로 뽑힌 ${list.length}곳(${list.join(', ')})` : '투표로 뽑힌 장소들'
  return `${head}이 일차 미정에 들어가 있어. 여행 날짜별로 이동 동선과 영업시간을 고려해 적절히 배치해 줘.`
}
