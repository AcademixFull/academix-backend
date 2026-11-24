import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/services/auth.service",()=>({ authService:{ verifyAccessToken:vi.fn() } }));
vi.mock("../src/services/subscription.service",()=>({ subscriptionService:{ plans:vi.fn(),list:vi.fn(),purchase:vi.fn(),transactions:vi.fn() } }));
import { createApp } from "../src/app";
import { authService } from "../src/services/auth.service";
import { subscriptionService } from "../src/services/subscription.service";
const app=createApp();
const user={id:"11111111-1111-4111-8111-111111111111",fullName:"Student",email:"student@example.test",role:"student" as const};
const key="22222222-2222-4222-8222-222222222222";
beforeEach(()=>{
 vi.clearAllMocks();vi.mocked(authService.verifyAccessToken).mockResolvedValue(user);
 vi.mocked(subscriptionService.list).mockResolvedValue({items:[],pagination:{page:1,limit:20,total:0,totalPages:1}});
 vi.mocked(subscriptionService.transactions).mockResolvedValue({items:[],pagination:{page:1,limit:10,total:0,totalPages:1}});
});
describe("subscription HTTP contracts",()=>{
 it("exposes the authoritative public catalog but protects private subscriptions",async()=>{
  vi.mocked(subscriptionService.plans).mockResolvedValue([{id:"organizations-monthly",name:"Academix Organizaciones",audience:"organization",priceMxn:1000,months:1,features:[],purchasable:true}]);
  const plans=await request(app).get("/api/v1/plans");expect(plans.status).toBe(200);expect(plans.body.data[0].priceMxn).toBe(1000);
  expect((await request(app).get("/api/v1/subscriptions")).status).toBe(401);
  expect((await request(app).get("/api/v1/subscriptions/transactions")).status).toBe(401);
 });
 it("uses the authenticated account and bounded pagination for both private lists",async()=>{
  await request(app).get("/api/v1/subscriptions?page=2&limit=10").set("Authorization","Bearer test").expect(200);
  expect(subscriptionService.list).toHaveBeenCalledWith(user.id,2,10);
  await request(app).get("/api/v1/subscriptions/transactions?page=3&limit=10").set("Authorization","Bearer test").expect(200);
  expect(subscriptionService.transactions).toHaveBeenCalledWith(user.id,3,10);
  await request(app).get("/api/v1/subscriptions?limit=1000").set("Authorization","Bearer test").expect(422);
 });
 it("rejects supplied prices and identity, then passes only selection and replay key",async()=>{
  const input={planId:"plus-monthly",idempotencyKey:key};
  await request(app).post("/api/v1/subscriptions/simulated-purchase").set("Authorization","Bearer test").send({...input,amount:0,userId:"other"}).expect(422);
  expect(subscriptionService.purchase).not.toHaveBeenCalled();
  vi.mocked(subscriptionService.purchase).mockResolvedValue({id:"receipt",mode:"simulated",currency:"MXN",amount:19.99,subscription:{id:"subscription",planId:"plus-monthly",planName:"Academix Plus Mensual",organizationId:null,startsAt:"2026-11-10",endsAt:"2026-12-10",status:"active"}});
  await request(app).post("/api/v1/subscriptions/simulated-purchase").set("Authorization","Bearer test").send(input).expect(201);
  expect(subscriptionService.purchase).toHaveBeenCalledWith(user.id,input);
 });
});
