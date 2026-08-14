async function testApi() {
  const url = "https://script.google.com/macros/s/AKfycbygKPspOCjVAkVfHwCxTxPuCYjVBzmvfBWDDN7L11QqrurhCDV3IBpqq7AxhZjwP1gClA/exec";
  const res = await fetch(url + "?action=getAcademicSchedule");
  const data = await res.json();
  console.log("Academic Schedule Test Result:", data);
}
testApi();
