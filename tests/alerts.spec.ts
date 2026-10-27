import { expect as playwrightExpect,test } from "@playwright/test";
import { loginNurse,accounts } from "./local-accounts";
import { existingOwnAlert } from "./alert-scenarios";
const expect=playwrightExpect.configure({timeout:20000});
test.use({trace:"off",screenshot:"off"});
test("actual queue/status filters and keyboard detail; denied refresh clears cached source; unassigned nurse cannot open it",async({page})=>{
  test.setTimeout(120000);
  const id=existingOwnAlert();await loginNurse(page);await page.getByRole("link",{name:"Eskalasi",exact:true}).click();await expect(page.getByRole("heading",{name:"Antrean eskalasi",exact:true})).toBeVisible();await expect(page.getByRole("combobox",{name:"Status alert",exact:true})).toHaveValue("active");
  await page.getByRole("combobox",{name:"Status alert",exact:true}).selectOption("all");const link=page.locator(`a[href="/escalations/${id}"]`);await link.waitFor();await link.focus();await link.press("Enter");await page.waitForURL(`**/escalations/${id}`);await expect(page.getByRole("heading",{name:"Detail eskalasi",exact:true})).toBeVisible();await expect(page.getByRole("link",{name:"Buka laporan sumber",exact:true})).toBeVisible();
  await page.route(`**/api/syncare/v1/alerts/${id}?**`,route=>route.fulfill({status:403,contentType:"application/json",body:JSON.stringify({error:{code:"forbidden",message:"Tidak memiliki akses",requestId:"synthetic-denial",retryable:false}})}));
  await page.getByRole("button",{name:"Muat ulang alert",exact:true}).click();await expect(page.getByRole("link",{name:"Buka laporan sumber",exact:true})).toHaveCount(0);await expect(page.getByRole("button",{name:"Akui alert",exact:true})).toHaveCount(0);await page.unroute(`**/api/syncare/v1/alerts/${id}?**`);
  await page.goto("/workspace");await page.getByRole("button",{name:"Keluar",exact:true}).click();await expect(page).toHaveURL(/\/login$/,{timeout:20000});
  await page.getByLabel("Identitas akun",{exact:true}).fill(accounts.nurses[1]!.identifier);await page.evaluate(password=>{const field=document.getElementById("password") as HTMLInputElement;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(field,password);field.dispatchEvent(new Event("input",{bubbles:true}));},accounts.nurses[1]!.password);await page.getByRole("button",{name:"Masuk",exact:true}).click();await expect(page).toHaveURL(/\/workspace$/,{timeout:20000});
  expect((await page.request.get(`/api/syncare/v1/alerts/${id}`)).status()).toBe(404);await page.goto(`/escalations/${id}`);await expect(page.getByRole("link",{name:"Buka laporan sumber",exact:true})).toHaveCount(0);
});
