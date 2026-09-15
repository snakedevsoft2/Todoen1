import { describe, expect, it } from "vitest";
import { detectarDispositivo } from "../src/lib/instalar";

/**
 * Reconocer el celular y el navegador para instalar la aplicacion.
 *
 * Con user agents reales: cada uno tiene que caer en el caso que le muestra
 * los pasos que si funcionan en ese celular.
 */
const UA = {
  chromeAndroid: "Mozilla/5.0 (Linux; Android 13; SM-A515F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  samsung: "Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
  firefoxAndroid: "Mozilla/5.0 (Android 13; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0",
  xiaomi: "Mozilla/5.0 (Linux; U; Android 12; es-es; 2201117TG Build/SKQ1) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/100.0 Mobile Safari/537.36 XiaoMi/MiuiBrowser/14.5.0",
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1",
  ipadNuevo: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  instagramIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0",
  facebookAndroid: "Mozilla/5.0 (Linux; Android 13; SM-A515F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/440.0.0.0;]",
  webviewAndroid: "Mozilla/5.0 (Linux; Android 13; SM-A515F; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36",
  windowsChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

describe("reconocer el celular para instalar", () => {
  it("Android: Chrome, Samsung, Firefox y los navegadores que no instalan bien", () => {
    expect(detectarDispositivo(UA.chromeAndroid, false)).toBe("android");
    expect(detectarDispositivo(UA.samsung, false)).toBe("samsung");
    expect(detectarDispositivo(UA.firefoxAndroid, false)).toBe("firefox-android");
    expect(detectarDispositivo(UA.xiaomi, false)).toBe("android-otro");
  });

  it("iPhone y iPad, también el iPad que se presenta como Mac", () => {
    expect(detectarDispositivo(UA.iphoneSafari, false)).toBe("ios-safari");
    expect(detectarDispositivo(UA.iphoneChrome, false)).toBe("ios-otro");
    expect(detectarDispositivo(UA.ipadNuevo, false, true)).toBe("ios-safari");
    expect(detectarDispositivo(UA.ipadNuevo, false, false)).toBe("escritorio");
  });

  it("dentro de Instagram, Facebook o un navegador interno no se puede instalar", () => {
    expect(detectarDispositivo(UA.instagramIos, false)).toBe("app-interna");
    expect(detectarDispositivo(UA.facebookAndroid, false)).toBe("app-interna");
    expect(detectarDispositivo(UA.webviewAndroid, false)).toBe("app-interna");
  });

  it("computador, y la aplicación ya instalada", () => {
    expect(detectarDispositivo(UA.windowsChrome, false)).toBe("escritorio");
    expect(detectarDispositivo(UA.iphoneSafari, true)).toBe("instalada");
  });
});
