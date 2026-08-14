async function testApi() {
  const url = "https://script.google.com/macros/s/AKfycbwNcrCqowXpJ9oYZSRcvWNuHD42TR_fVXljpnaC5I314Dr1Oj77-P-d-frXxdK7cT3u0A/exec";
  const res = await fetch(url + "?action=getAcademicSchedule");
  const data = await res.json();
  console.log("Academic Schedule Test Result:", data);
}
testApi();
