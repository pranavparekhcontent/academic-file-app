async function testApi() {
  const url = "https://script.google.com/macros/s/AKfycbxH8oHwujYjOdZ8LwrbtTStHp0ziSISiRKHiPiMfzkc_jcHoyn55mnV-a3BjroM07jD1A/exec";
  const res = await fetch(url + "?action=getAcademicSchedule");
  const data = await res.json();
  console.log("Academic Schedule Test Result:", data);
}
testApi();
