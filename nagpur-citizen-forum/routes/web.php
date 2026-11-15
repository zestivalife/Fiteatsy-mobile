<?php
use App\Controllers\{AuthController,DiscussionController,EventController,IssueController,PublicController};
$router->get('/',[PublicController::class,'home']);
$router->get('/about',fn()=> (new PublicController())->page('about'));
$router->get('/privacy',fn()=> (new PublicController())->page('privacy'));
$router->get('/accessibility',fn()=> (new PublicController())->page('accessibility'));
$router->get('/events',[PublicController::class,'events']);$router->get('/events/{slug}',[EventController::class,'show']);$router->post('/events/{id}/register',[EventController::class,'register']);
$router->get('/campaigns',[PublicController::class,'campaigns']);$router->get('/campaigns/{slug}',[PublicController::class,'campaign']);
$router->get('/articles',[PublicController::class,'articles']);$router->get('/articles/{slug}',[PublicController::class,'article']);$router->get('/search',[PublicController::class,'search']);
$router->get('/contact',[PublicController::class,'contact']);$router->post('/contact',[PublicController::class,'storeContact']);$router->get('/join',[PublicController::class,'join']);$router->post('/join',[PublicController::class,'storeJoin']);
$router->get('/login',[AuthController::class,'login']);$router->post('/login',[AuthController::class,'authenticate']);$router->get('/register',[AuthController::class,'register']);$router->post('/register',[AuthController::class,'store']);$router->post('/logout',[AuthController::class,'logout']);$router->get('/account',[AuthController::class,'account']);
$router->get('/issues',[IssueController::class,'index']);$router->get('/issues/create',[IssueController::class,'create']);$router->post('/issues',[IssueController::class,'store']);$router->post('/issues/{id}/support',[IssueController::class,'support']);$router->get('/issues/{slug}',[IssueController::class,'show']);
$router->get('/discussions',[DiscussionController::class,'index']);$router->get('/discussions/create',[DiscussionController::class,'create']);$router->post('/discussions',[DiscussionController::class,'store']);$router->post('/discussions/{id}/comments',[DiscussionController::class,'comment']);$router->get('/discussions/{slug}',[DiscussionController::class,'show']);
