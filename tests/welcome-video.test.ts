import { describe, expect, it } from "vitest";
import { videoEmbed } from "../src/lib/welcome-video";

/**
 * El video de bienvenida acepta un enlace de YouTube, de Vimeo o un archivo
 * de video directo, y lo deja listo para incrustar sin que el enlace roto (o
 * un formato raro) tumbe la pantalla.
 */
describe("videoEmbed", () => {
  it("convierte YouTube (normal y youtu.be) a su forma para incrustar", () => {
    expect(videoEmbed("https://www.youtube.com/watch?v=abc123")).toEqual({
      tipo: "iframe",
      src: "https://www.youtube.com/embed/abc123",
    });
    expect(videoEmbed("https://youtu.be/abc123")).toEqual({ tipo: "iframe", src: "https://www.youtube.com/embed/abc123" });
  });

  it("convierte Vimeo a su forma para incrustar", () => {
    expect(videoEmbed("https://vimeo.com/76979871")).toEqual({
      tipo: "iframe",
      src: "https://player.vimeo.com/video/76979871",
    });
  });

  it("un archivo de video directo se reproduce con <video>", () => {
    expect(videoEmbed("https://cdn.negocio.com/tutorial.mp4")).toEqual({ tipo: "video", src: "https://cdn.negocio.com/tutorial.mp4" });
  });

  it("cualquier otro enlace se intenta como iframe, y uno invalido no revienta", () => {
    expect(videoEmbed("https://www.loom.com/embed/xyz")).toEqual({ tipo: "iframe", src: "https://www.loom.com/embed/xyz" });
    expect(videoEmbed("no es un enlace")).toBeNull();
  });
});
