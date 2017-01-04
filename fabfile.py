import logging
import os
from functools import partial
from shutil import rmtree

import yaml

from fabric.api import cd, env, lcd, local, put, run, task
from fabric.contrib.project import rsync_project

logging.basicConfig(level=logging.DEBUG)

log = logging.getLogger()
repo_root = local('git rev-parse --show-toplevel', capture=True)
workspace = local('mktemp -d', capture=True)
conf_file = 'publish.yaml'
ignore = ['.git', 'fabfile.py', 'README.md']

try:
    conf = yaml.load(open(os.path.join(repo_root, conf_file), 'rb').read())
except:
    log.exception('error: unable to read {} config file:'.format(conf_file))
    raise

env.user = conf['user']
env.hosts = ['{}@{}:22'.format(env.user, host) for host in conf['hosts']]


def export():
    """Exports repository's master branch to a temporary workspace."""
    with lcd(repo_root):
        local('git archive master | tar -x -C ' + workspace)


@task
def publish():
    """Publishes source to remote web server."""
    export()

    remote_dir = conf['mainwebsite_html']
    sync = partial(
        rsync_project,
        remote_dir=remote_dir,
        exclude=ignore,
        extra_opts="-e 'ssh -l {}'".format(conf['user']))

    try:
        with lcd(workspace):
            sync(local_dir='www', delete=True)
            sync(local_dir='resume', delete=True)
            sync(local_dir='github', delete=True)
            sync(local_dir='pancake', delete=True)
            sync(local_dir='nanodbc', delete=True)
            sync(local_dir='darwi', delete=True)
            sync(local_dir='shares', delete=False)
            with cd(remote_dir):
                put('index.html', 'index.html', mode=0o755)
                run('chmod 777 shares')
                run('chmod 777 shares/thumbs')
    except:
        log.exception('publish error:')
        raise
    finally:
        rmtree(workspace)
