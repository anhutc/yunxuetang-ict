soBaiHoc = document.getElementsByClassName('linozj').length
if (soBaiHoc > 0) {
  let iHoc = 0
  var idHoc =[] , hoc = 1
  let tiepTuc, xacDinh, thoiGian, tocDo
  for (let i = 0; i < soBaiHoc; i++) {
    if (document.getElementsByClassName('linozj')[i].childNodes[0].childNodes[0].childNodes[0].innerText == "video" && document.getElementsByClassName('linozj')[i].childNodes[0].childNodes[1].childNodes[0].innerHTML != '<path d="M0 0h20v20H0z"></path><path fill="currentColor" stroke="#FFF" stroke-width="1.5" d="M10 2.75c2.002 0 3.815.811 5.127 2.123A7.227 7.227 0 0117.25 10a7.227 7.227 0 01-2.123 5.127A7.227 7.227 0 0110 17.25a7.227 7.227 0 01-5.127-2.123A7.227 7.227 0 012.75 10c0-2.002.811-3.815 2.123-5.127A7.227 7.227 0 0110 2.75zm3.636 3.512c-.407 0-.845.142-1.244.474h0l-3.697 3.696-1.581-1.573-.136-.101a1.748 1.748 0 00-2.725 1.34c-.025.401.065.82.485 1.324h0l2.507 2.496.16.124c.387.271.84.407 1.292.407.491 0 .993-.144 1.57-.638h0l4.685-4.697.102-.136a1.748 1.748 0 00-.214-2.215 1.683 1.683 0 00-1.204-.501z"></path>'){
      iHoc++
      idHoc[iHoc] = i
    }
  }
  if (idHoc[1] != undefined) {
    document.getElementsByClassName('linozj')[idHoc[1]].click()
    var checkTime = setInterval(fcChecktime, 30000)
    function fcChecktime(){
      tiepTuc = document.getElementsByClassName('yxtf-button--larger')[0]
      xacDinh = document.getElementsByClassName('yxtf-button--large')[0]
      thoiGian = document.getElementsByClassName('yxt-color-warning')[0]
      tocDo = document.getElementsByClassName('jw-item-0')[4]
      if (tiepTuc != undefined){
        tiepTuc.click()
      }
      if (xacDinh != undefined){
        xacDinh.click()
      }
      if (thoiGian === undefined){
        if (hoc >=idHoc.length){
          clearInterval(checkTime);
          alert("Đã học xong!")
        } else {
          document.getElementsByClassName('linozj')[idHoc[hoc]].click()
          hoc++
        }
      }
      if (document.getElementsByClassName('jw-playrate-label')[0].innerText != 'x2'){
        tocDo.click()
      }
    }
  } else {
    alert("Đã học xong!")
  }
} else{
  alert("Không tìm thấy bài học nào!")
}
