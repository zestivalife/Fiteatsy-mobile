<?php
declare(strict_types=1);
namespace App\Services;

final class UploadService
{
    private const ALLOWED=['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp','application/pdf'=>'pdf'];
    public function store(array $file,string $folder,bool $imageOnly=false):?array
    {
        if(($file['error']??UPLOAD_ERR_NO_FILE)===UPLOAD_ERR_NO_FILE)return null;if(($file['error']??1)!==UPLOAD_ERR_OK)throw new \InvalidArgumentException('Upload failed.');
        if((int)$file['size']>(int)config('app.upload_max_bytes'))throw new \InvalidArgumentException('File is too large.');
        $mime=(new \finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);if(!isset(self::ALLOWED[$mime])||($imageOnly&&!str_starts_with($mime,'image/')))throw new \InvalidArgumentException($imageOnly?'Upload a JPG, PNG or WebP image.':'Unsupported file type.');
        $dimensions=null;if($imageOnly){$dimensions=@getimagesize($file['tmp_name']);if(!$dimensions)throw new \InvalidArgumentException('The uploaded file is not a valid image.');[$width,$height]=$dimensions;if($width<240||$height<120)throw new \InvalidArgumentException('Image dimensions must be at least 240 × 120 pixels.');if($width>10000||$height>10000)throw new \InvalidArgumentException('Image dimensions are too large.');}
        $name=bin2hex(random_bytes(20)).'.'.self::ALLOWED[$mime];$dir=BASE_PATH.'/public/uploads/'.$folder;if(!is_dir($dir)&&!mkdir($dir,0755,true))throw new \RuntimeException('Upload directory unavailable.');
        $absolute=$dir.'/'.$name;if(!move_uploaded_file($file['tmp_name'],$absolute))throw new \RuntimeException('Could not save upload.');$sourcePath='uploads/'.$folder.'/'.$name;$displayPath=$sourcePath;if($imageOnly&&($dimensions[0]??0)>1600&&function_exists('imagewebp'))$displayPath=$this->optimisedVariant($absolute,$dir,$folder,$mime,$dimensions[0],$dimensions[1])??$sourcePath;return ['path'=>$displayPath,'source_path'=>$sourcePath,'original'=>basename($file['name']),'mime'=>$mime,'size'=>(int)$file['size'],'width'=>$dimensions[0]??null,'height'=>$dimensions[1]??null];
    }
    private function optimisedVariant(string $source,string $directory,string $folder,string $mime,int $width,int $height):?string
    {
        $loader=match($mime){'image/jpeg'=>'imagecreatefromjpeg','image/png'=>'imagecreatefrompng','image/webp'=>'imagecreatefromwebp',default=>null};if(!$loader||!function_exists($loader))return null;$image=@$loader($source);if(!$image)return null;$targetWidth=1600;$targetHeight=max(1,(int)round($height*($targetWidth/$width)));$target=imagecreatetruecolor($targetWidth,$targetHeight);if(!$target){imagedestroy($image);return null;}imagealphablending($target,false);imagesavealpha($target,true);imagecopyresampled($target,$image,0,0,0,0,$targetWidth,$targetHeight,$width,$height);$variant=bin2hex(random_bytes(20)).'-1600.webp';$saved=imagewebp($target,$directory.'/'.$variant,82);imagedestroy($target);imagedestroy($image);return $saved?'uploads/'.$folder.'/'.$variant:null;
    }
}
