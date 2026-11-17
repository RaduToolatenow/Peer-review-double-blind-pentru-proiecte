import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef } from 'pdf-lib';

/**
 * Removes who wrote a PDF (D-016): the document info, the XMP metadata stream and the
 * author of every annotation. The pages themselves are kept as they are.
 */
export async function cleanPdf(file: Buffer): Promise<Buffer> {
  const pdf = await PDFDocument.load(file, { updateMetadata: false });

  pdf.setAuthor('');
  pdf.setTitle('');
  pdf.setSubject('');
  pdf.setKeywords([]);
  pdf.setCreator('');
  pdf.setProducer('');

  // Deleting the object too, since pdf-lib writes every object it loaded, referenced or not.
  const metadata = pdf.catalog.get(PDFName.of('Metadata'));
  if (metadata instanceof PDFRef) {
    pdf.context.delete(metadata);
  }
  pdf.catalog.delete(PDFName.of('Metadata'));

  for (const page of pdf.getPages()) {
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    for (let i = 0; annots && i < annots.size(); i++) {
      const annot = annots.lookupMaybe(i, PDFDict);
      annot?.delete(PDFName.of('T'));
      annot?.delete(PDFName.of('RC'));
    }
  }

  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}
