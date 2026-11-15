<?php
declare(strict_types=1);
namespace App\Core;

final class Router
{
    private array $routes=[];
    public function get(string $path, callable|array $handler): void {$this->add('GET',$path,$handler);}
    public function post(string $path, callable|array $handler): void {$this->add('POST',$path,$handler);}
    public function put(string $path, callable|array $handler): void {$this->add('PUT',$path,$handler);}
    public function delete(string $path, callable|array $handler): void {$this->add('DELETE',$path,$handler);}
    private function add(string $method,string $path,callable|array $handler):void{$pattern=preg_replace('#\{([a-zA-Z_][a-zA-Z0-9_]*)\}#','(?P<$1>[^/]+)',$path);$this->routes[]=[$method,'#^'.rtrim($pattern,'/').'/?$#',$handler];}
    public function dispatch(): void
    {
        $method=strtoupper($_POST['_method']??$_SERVER['REQUEST_METHOD']); $path=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH)?:'/';
        $base=rtrim(dirname($_SERVER['SCRIPT_NAME']),'/'); if($base && $base!=='/' && str_starts_with($path,$base))$path=substr($path,strlen($base))?:'/';
        if(!in_array($method,['GET','HEAD'],true)) Csrf::verify($_POST['_token']??($_SERVER['HTTP_X_CSRF_TOKEN']??null));
        foreach($this->routes as [$verb,$pattern,$handler]){if($verb!==$method||!preg_match($pattern,$path,$m))continue;$args=array_filter($m,'is_string',ARRAY_FILTER_USE_KEY);if(is_array($handler)){[$class,$fn]=$handler;(new $class())->$fn(...array_values($args));}else{$handler(...array_values($args));}return;}
        http_response_code(404); View::render('errors/404',['title'=>'Page not found']);
    }
}

