async function testApi() {
  const url = "https://script.google.com/macros/s/AKfycby46srlH7Obksz2EEiKcA8rc3EQLVOA7x4FXCiWg9q2X0oKAegveZX4bi75qGMFeyI44g/exec";
  const res = await fetch(url + "?action=getAcademicSchedule");
  const data = await res.json();
  console.log("Academic Schedule Test Result:", data);
}
testApi();
