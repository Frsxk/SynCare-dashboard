import { expect,test } from "@playwright/test";
import { loginNurse } from "./local-accounts";
import { toWib } from "./homecare-scenarios";
import { asPatient,pendingAlert,recordAlert } from "./alert-scenarios";
test.use({trace:"off",screenshot:"off"});
test("actual F2 alert: held/lost acknowledgment, stale second reviewer409, explicit follow-up/publication and terminal closure",async({page,browser},info)=>{
  test.setTimeout(120000);
  const source=await pendingAlert();await loginNurse(page);await page.goto(`/escalations/${source.id}`);
  await expect(page.getByText("Status: Menunggu review",{exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Akui alert",exact:true})).toBeEnabled();
  const initial=(await(await page.request.get(`/api/syncare/v1/alerts/${source.id}`)).json()).data;expect(initial.version).toBe(1);
  const secondContext=await browser.newContext({baseURL:"http://127.0.0.1:3101"}),other=await secondContext.newPage();
  try{
    await loginNurse(other);await other.goto(`/escalations/${source.id}`);await expect(other.getByRole("button",{name:"Akui alert",exact:true})).toBeEnabled();
    let release!:()=>void,reached!:()=>void,drop=true;const held=new Promise<void>(resolve=>{release=resolve;}),committed=new Promise<void>(resolve=>{reached=resolve;});const keys:string[]=[];
    await page.route(`**/api/syncare/v1/alerts/${source.id}/actions`,async route=>{
      keys.push(route.request().headers()["idempotency-key"]!);
      if(drop){drop=false;const result=await route.fetch();expect(result.status()).toBe(200);reached();await held;await route.abort();}else await route.continue();
    });
    await page.getByRole("button",{name:"Akui alert",exact:true}).click();await committed;
    await expect(page.getByText("Status: Menunggu review",{exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Akui alert",exact:true})).toBeDisabled();release();
    await expect(page.getByRole("button",{name:"Periksa tindakan yang sama",exact:true})).toBeVisible();await page.getByRole("button",{name:"Periksa tindakan yang sama",exact:true}).click();await expect(page.getByText("Status: Diakui perawat",{exact:true})).toBeVisible();expect(keys).toHaveLength(2);expect(keys[0]).toBe(keys[1]);
    await page.unroute(`**/api/syncare/v1/alerts/${source.id}/actions`);
    const conflict=other.waitForResponse(r=>r.url().endsWith(`/alerts/${source.id}/actions`)&&r.status()===409);await other.getByRole("button",{name:"Akui alert",exact:true}).click();await conflict;await expect(other.getByText("Status: Diakui perawat",{exact:true})).toBeVisible();await expect(other.getByText("Tindakan tersimpan.",{exact:true})).toHaveCount(0);
    await page.getByRole("combobox",{name:"Jenis tindakan",exact:true}).selectOption("contact_attempt");await page.getByLabel("Waktu tindakan (WIB)",{exact:true}).fill(toWib(Date.now()+3600000));await page.getByLabel("Catatan tindakan internal",{exact:true}).fill("INTERNAL M07: upaya kontak simulasi, tidak ada panggilan nyata.");await page.getByLabel("Ringkasan tindak lanjut untuk pasien (opsional)",{exact:true}).fill("Perawat mencatat upaya tindak lanjut simulasi.");
    await page.getByRole("button",{name:"Simpan tindak lanjut",exact:true}).click();await expect(page.getByText("Periksa kembali data yang dikirim.",{exact:true})).toBeVisible();await expect(page.getByLabel("Catatan tindakan internal",{exact:true})).toHaveValue("INTERNAL M07: upaya kontak simulasi, tidak ada panggilan nyata.");
    await page.setViewportSize({width:320,height:800});await page.evaluate(()=>{document.documentElement.style.fontSize="200%";});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);await page.screenshot({path:info.outputPath("m07-followup-320-text200.png"),fullPage:true});
    await page.setViewportSize({width:768,height:900});await page.evaluate(()=>{document.documentElement.style.fontSize="";});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
    await page.getByLabel("Waktu tindakan (WIB)",{exact:true}).fill(toWib(Date.now()));await page.getByRole("button",{name:"Simpan tindak lanjut",exact:true}).click();await expect(page.getByText("Status: Sedang ditindaklanjuti",{exact:true})).toBeVisible();await expect(page.getByLabel("Catatan tindakan internal",{exact:true})).toHaveValue("");
    await page.getByLabel("Ringkasan penutupan internal",{exact:true}).fill("INTERNAL M07: ringkasan penutupan proses simulasi.");await page.getByLabel("Ringkasan penutupan untuk pasien (opsional)",{exact:true}).fill("Proses tindak lanjut simulasi ditutup; ini bukan penilaian pasien sembuh.");await page.getByRole("button",{name:"Tutup alert",exact:true}).click();await expect(page.getByText("Status: Ditutup",{exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Akui alert",exact:true})).toHaveCount(0);await expect(page.getByRole("button",{name:"Simpan tindak lanjut",exact:true})).toHaveCount(0);
    const stored=(await(await page.request.get(`/api/syncare/v1/alerts/${source.id}`)).json()).data;expect(stored.timeline).toHaveLength(4);expect(stored.timeline.filter((e:{action:string})=>e.action==="acknowledge")).toHaveLength(1);
    await asPatient(0,async call=>{const response=await call(`alerts/${source.id}`);expect(response.status).toBe(200);const text=await response.text();expect(text).toContain("Proses tindak lanjut simulasi ditutup");for(const value of ["INTERNAL M07","internalNote","actorId","actionType"])expect(text).not.toContain(value);});
    await asPatient(1,async call=>{expect((await call(`alerts/${source.id}`)).status).toBe(404);});
    await page.setViewportSize({width:1280,height:900});await page.screenshot({path:info.outputPath("m07-resolved.png"),fullPage:true});recordAlert(source.id);
  }finally{await secondContext.close();}
});
