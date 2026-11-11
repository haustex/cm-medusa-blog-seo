import { defaultDir, defaultLocaleName, matchLocale, normalizeLocale } from "../locales"
import { cleanLocales } from "../settings"

describe("locales", () => {
  it("normalizeLocale: canonical BCP 47 spelling, null for junk", () => {
    expect(normalizeLocale("EN-us")).toBe("en-US")
    expect(normalizeLocale("pt_br")).toBe("pt-BR")
    expect(normalizeLocale("zh-hant-tw")).toBe("zh-Hant-TW")
    expect(normalizeLocale(" id ")).toBe("id")
    expect(normalizeLocale("x")).toBeNull()
    expect(normalizeLocale("en us")).toBeNull()
    expect(normalizeLocale(null)).toBeNull()
  })
  it("defaultDir: rtl for Arabic, Hebrew, Persian, Urdu", () => {
    expect(defaultDir("ar")).toBe("rtl")
    expect(defaultDir("he-IL")).toBe("rtl")
    expect(defaultDir("fa")).toBe("rtl")
    expect(defaultDir("id")).toBe("ltr")
  })
  it("defaultLocaleName: native names, the code when unknown", () => {
    expect(defaultLocaleName("de")).toBe("Deutsch")
    expect(defaultLocaleName("id")).toBe("Indonesia")
    expect(typeof defaultLocaleName("xx")).toBe("string")
  })
  it("matchLocale: exact, same language, else the default", () => {
    const locales = [{ code: "id", enabled: true }, { code: "en-US", enabled: true }, { code: "de", enabled: false }]
    expect(matchLocale("en-us", locales, "id")).toBe("en-US")
    expect(matchLocale("en", locales, "id")).toBe("en-US")
    expect(matchLocale("en-GB", locales, "id")).toBe("en-US")
    expect(matchLocale("de", locales, "id")).toBe("id")
    expect(matchLocale(undefined, locales, "id")).toBe("id")
    expect(matchLocale("fr", locales, "id")).toBe("id")
  })
  it("cleanLocales: codes or objects, duplicates dropped, names/dirs filled, ranked", () => {
    expect(cleanLocales(["id", { code: "AR", dir: "rtl" }, "id", { code: "en", name: "English (US)", enabled: false }, "bad code"])).toEqual([
      { code: "id", name: "Indonesia", dir: "ltr", enabled: true, rank: 0 },
      { code: "ar", name: "العربية", dir: "rtl", enabled: true, rank: 1 },
      { code: "en", name: "English (US)", dir: "ltr", enabled: false, rank: 2 },
    ])
    expect(cleanLocales(null)).toEqual([])
  })
})
