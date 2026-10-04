/**
 * 坐标与地图链接。
 *
 * 【为什么需要转换】浏览器的 `navigator.geolocation` 返回的是 **WGS84**（GPS 原始坐标），
 * 而国内地图（高德/腾讯）用的是 **GCJ-02**（火星坐标）。直接把 WGS84 丢给高德会偏移
 * 几百米 —— 对一个「去这里取回你丢的东西」的场景来说是不可接受的。
 * 这里用公开的 WGS84 → GCJ-02 转换算法（境外坐标不做偏移）。
 */
const A = 6378245.0
const EE = 0.006_693_421_622_965_943

function outOfChina(lat: number, lng: number): boolean {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271
}

function transformLat(x: number, y: number): number {
  let ret =
    -100 +
    2 * x +
    3 * y +
    0.2 * y * y +
    0.1 * x * y +
    0.2 * Math.sqrt(Math.abs(x))
  ret +=
    ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3
  ret +=
    ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3
  ret +=
    ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) *
      2) /
    3
  return ret
}

function transformLng(x: number, y: number): number {
  let ret =
    300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  ret +=
    ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3
  ret +=
    ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3
  ret +=
    ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) *
      2) /
    3
  return ret
}

export function wgs84ToGcj02(
  lat: number,
  lng: number
): { lat: number; lng: number } {
  if (outOfChina(lat, lng)) return { lat, lng }
  const dLat = transformLat(lng - 105, lat - 35)
  const dLng = transformLng(lng - 105, lat - 35)
  const radLat = (lat / 180) * Math.PI
  let magic = Math.sin(radLat)
  magic = 1 - EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  return {
    lat:
      lat + (dLat * 180) / (((A * (1 - EE)) / (magic * sqrtMagic)) * Math.PI),
    lng: lng + (dLng * 180) / ((A / sqrtMagic) * Math.cos(radLat) * Math.PI),
  }
}

/** 高德「标记点」链接（`coordinate=gaode` 表示传进去的是 GCJ-02） */
export function amapMarkerUrl(input: {
  lat: number
  lng: number
  label?: string
}): string {
  const gcj = wgs84ToGcj02(input.lat, input.lng)
  const params = new URLSearchParams({
    position: gcj.lng.toFixed(6) + "," + gcj.lat.toFixed(6),
    coordinate: "gaode",
    callnative: "1",
  })
  if (input.label) params.set("name", input.label)
  return "https://uri.amap.com/marker?" + params.toString()
}

/** 只有位置描述、没有坐标时：用高德搜地点 */
export function amapSearchUrl(keyword: string): string {
  const params = new URLSearchParams({ keyword, callnative: "1" })
  return "https://uri.amap.com/search?" + params.toString()
}
