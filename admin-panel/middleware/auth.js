function requireAuth(req, res, next) {
  if (!req.session || !req.session.admin) {
    return res.redirect('/login');
  }
  next();
}

module.exports = { requireAuth };
