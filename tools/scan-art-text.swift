// Reads the text inside every picture of a folder with Apple Vision (macOS only), so a name drawn into art
// is found: check-sim only reads text the sim draws itself. Build: swiftc -O tools/scan-art-text.swift -o <bin>
// Usage: <bin> <folder of .png/.jpg>  prints "<file>\t<text>"; pictures under 24x12 px are skipped.
import Foundation; import Vision; import AppKit
let dir=CommandLine.arguments[1]; var hits=0,n=0
for f in try! FileManager.default.contentsOfDirectory(atPath:dir).sorted(){
 guard let img=NSImage(contentsOfFile:dir+"/"+f), let t=img.tiffRepresentation, let rep=NSBitmapImageRep(data:t) else{continue}
 let w=rep.pixelsWide,h=rep.pixelsHigh; if w<24||h<12 {continue}
 // upscale small art so short words are readable, paint over white
 let scale=max(1,min(4,1600/max(w,h))); let W=w*scale,H=h*scale
 let cs=CGColorSpaceCreateDeviceRGB(); guard let c=CGContext(data:nil,width:W,height:H,bitsPerComponent:8,bytesPerRow:0,space:cs,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue), let cg=rep.cgImage else{continue}
 c.setFillColor(CGColor(red:1,green:1,blue:1,alpha:1)); c.fill(CGRect(x:0,y:0,width:W,height:H)); c.interpolationQuality = .high; c.draw(cg,in:CGRect(x:0,y:0,width:W,height:H))
 guard let up=c.makeImage() else{continue}
 let r=VNRecognizeTextRequest(); r.recognitionLevel = .accurate; r.usesLanguageCorrection=false
 try? VNImageRequestHandler(cgImage:up).perform([r]); n+=1
 let txt=(r.results ?? []).compactMap{$0.topCandidates(1).first?.string}.joined(separator:" | ")
 if !txt.isEmpty { print("\(f)\t\(txt)") }
}
FileHandle.standardError.write("scanned \(n)\n".data(using:.utf8)!)
