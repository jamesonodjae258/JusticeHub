$word = New-Object -ComObject Word.Application
$word.Visible = $false
$doc = $word.Documents.Open("C:\Users\DanielKing\Music\justicehub\JusticeHub_Phase2_PRD_v2.docx")
$text = $doc.Content.Text
$doc.Close()
$word.Quit()
$text | Out-File -Encoding utf8 "C:\Users\DanielKing\Music\justicehub\scratch\phase2_prd_extracted.txt"
Write-Host "Extraction complete"
