import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ title: "Before", rating: 3, reads: 0 }));
vi.mock("../src/repositories/catalog.repository", () => ({ catalogRepository: {
  listFeaturedCourses: async () => {
    state.reads++;
    return [{ id: "course", slug: "course", title: state.title, shortDescription: "", durationHours: 1,
      price: 10, certificateEnabled: true, category: { id: 1, name: "Course", slug: "course" },
      instructor: { id: "instructor", fullName: "Instructor", specialty: "" }, levelName: "Básico" }];
  },
} }));
vi.mock("../src/services/review.service", () => ({ reviewService: {
  statsByCourseIds: async () => new Map([["course", { rating: state.rating, reviewCount: 1 }]]),
} }));
import { catalogService, invalidatePublicCatalog } from "../src/services/catalog.service";
import { invalidateCatalogOnMutation } from "../src/middleware/catalog-cache";

describe("shared catalog mutation invalidation", () => {
  const app = express();
  app.use(invalidateCatalogOnMutation);
  app.get("/courses/featured", async (_req, res) => { res.json(await catalogService.listFeaturedCourses()); });
  app.patch("/courses/course", (_req, res) => { state.title = "After"; res.sendStatus(204); });
  app.post("/reviews/course", (_req, res) => { state.rating = 5; res.sendStatus(201); });
  app.patch("/courses/rejected", (_req, res) => { res.sendStatus(403); });
  beforeEach(() => { invalidatePublicCatalog(); state.title = "Before"; state.rating = 3; state.reads = 0; });

  it("reuses shared metadata and refreshes its title after a committed course change", async () => {
    expect((await request(app).get("/courses/featured")).body[0].title).toBe("Before");
    await request(app).get("/courses/featured");
    expect(state.reads).toBe(1);
    await request(app).patch("/courses/course");
    expect((await request(app).get("/courses/featured")).body[0].title).toBe("After");
    expect(state.reads).toBe(2);
  });
  it("refreshes featured review statistics after a review and preserves cache after rejected mutations", async () => {
    expect((await request(app).get("/courses/featured")).body[0].rating).toBe(3);
    await request(app).patch("/courses/rejected");
    await request(app).get("/courses/featured");
    expect(state.reads).toBe(1);
    await request(app).post("/reviews/course");
    expect((await request(app).get("/courses/featured")).body[0].rating).toBe(5);
    expect(state.reads).toBe(2);
  });
});
