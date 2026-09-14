/** 한국관광공사 관광사진 공모전 수상작 1건. */
export interface AwardPhoto {
  awardContentId: string | null
  title: string | null
  /** 촬영지에서 추출한 관광지명. 추출 실패 시 null */
  placeName: string | null
  /** 촬영지에서 추출한 행정구역명. 추출 실패 시 null */
  regionName: string | null
  /** 촬영지 원문 */
  filmLocation: string | null
  /** 촬영자. 출처 표시에 필요하다 */
  photographer: string | null
  /** 수상 부문. 출처 표시에 필요하다 */
  awardDivision: string | null
  /** 촬영 시기 (yyyy-MM) */
  filmYearMonth: string | null
  imageUrl: string
  thumbnailUrl: string | null
  /** 저작권 구분 코드. Type1은 출처 표시 조건이 붙는다 */
  copyrightCode: string | null
  /** 촬영지 시도 코드 */
  regionCode: string | null
}
